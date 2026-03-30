import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdminSession } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, monthlyTokenLimit: true, assignedModel: true },
  });
  if (!user) {
    return NextResponse.json({ message: "用户不存在" }, { status: 404 });
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000);

  // Recent 30-day detail records
  const records = await prisma.aiTokenUsage.findMany({
    where: { userId: id, createdAt: { gte: thirtyDaysAgo } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      module: true,
      model: true,
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
      estimatedCost: true,
      createdAt: true,
    },
  });

  // Current month aggregation
  const monthAgg = await prisma.aiTokenUsage.aggregate({
    where: { userId: id, createdAt: { gte: monthStart } },
    _sum: { totalTokens: true, estimatedCost: true },
  });

  // Per-module breakdown (30 days)
  const moduleBreakdown = await prisma.aiTokenUsage.groupBy({
    by: ["module"],
    where: { userId: id, createdAt: { gte: thirtyDaysAgo } },
    _sum: { totalTokens: true, estimatedCost: true },
    orderBy: { _sum: { totalTokens: "desc" } },
  });

  // Daily usage (30 days) — grouped by date string
  const dailyRecords = await prisma.aiTokenUsage.findMany({
    where: { userId: id, createdAt: { gte: thirtyDaysAgo } },
    select: { totalTokens: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const dailyMap = new Map<string, number>();
  for (const r of dailyRecords) {
    const day = r.createdAt.toISOString().slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + r.totalTokens);
  }
  const dailyUsage = Array.from(dailyMap.entries()).map(([date, tokens]) => ({ date, tokens }));

  return NextResponse.json({
    user,
    monthlyUsed: monthAgg._sum.totalTokens ?? 0,
    monthlyUsedCost: monthAgg._sum.estimatedCost ?? 0,
    usagePercent:
      user.monthlyTokenLimit > 0
        ? Math.round(((monthAgg._sum.totalTokens ?? 0) / user.monthlyTokenLimit) * 100)
        : 0,
    moduleBreakdown: moduleBreakdown.map((r) => ({
      module: r.module,
      tokens: r._sum.totalTokens ?? 0,
      cost: r._sum.estimatedCost ?? 0,
    })),
    dailyUsage,
    records,
  });
}
