import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdminSession } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Company-wide totals for current month
  const totalsAgg = await prisma.aiTokenUsage.aggregate({
    where: { createdAt: { gte: monthStart } },
    _sum: { totalTokens: true, estimatedCost: true },
  });

  // Per-user totals for ranking
  const perUserAgg = await prisma.aiTokenUsage.groupBy({
    by: ["userId"],
    where: { createdAt: { gte: monthStart } },
    _sum: { totalTokens: true, estimatedCost: true },
    orderBy: { _sum: { totalTokens: "desc" } },
    take: 50,
  });

  const userIds = perUserAgg.map((r) => r.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, role: true, monthlyTokenLimit: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  // Most-used module per user
  const moduleAgg = await prisma.aiTokenUsage.groupBy({
    by: ["userId", "module"],
    where: { createdAt: { gte: monthStart }, userId: { in: userIds } },
    _sum: { totalTokens: true },
    orderBy: { _sum: { totalTokens: "desc" } },
  });

  // Build top module per user
  const topModulePerUser = new Map<string, string>();
  for (const row of moduleAgg) {
    if (!topModulePerUser.has(row.userId)) {
      topModulePerUser.set(row.userId, row.module);
    }
  }

  const ranking = perUserAgg.map((r, idx) => {
    const u = userMap.get(r.userId);
    const tokens = r._sum.totalTokens ?? 0;
    const limit = u?.monthlyTokenLimit ?? 500000;
    return {
      rank: idx + 1,
      userId: r.userId,
      name: u?.name ?? "—",
      email: u?.email ?? "—",
      role: u?.role ?? "EMPLOYEE",
      totalTokens: tokens,
      estimatedCost: r._sum.estimatedCost ?? 0,
      monthlyTokenLimit: limit,
      usagePercent: limit > 0 ? Math.round((tokens / limit) * 100) : 0,
      topModule: topModulePerUser.get(r.userId) ?? "—",
    };
  });

  return NextResponse.json({
    companyTotal: {
      tokens: totalsAgg._sum.totalTokens ?? 0,
      cost: totalsAgg._sum.estimatedCost ?? 0,
    },
    ranking,
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  });
}
