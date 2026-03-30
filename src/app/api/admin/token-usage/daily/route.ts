import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdminSession } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const moduleFilter = searchParams.get("module") ?? undefined;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);

  const where = {
    createdAt: { gte: thirtyDaysAgo },
    ...(moduleFilter ? { module: moduleFilter } : {}),
  };

  const records = await prisma.aiTokenUsage.findMany({
    where,
    select: { totalTokens: true, createdAt: true, module: true },
    orderBy: { createdAt: "asc" },
  });

  // Group by date
  const dailyMap = new Map<string, number>();
  for (const r of records) {
    const day = r.createdAt.toISOString().slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + r.totalTokens);
  }

  const daily = Array.from(dailyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, tokens]) => ({ date, tokens }));

  // Module breakdown for filter options
  const modules = await prisma.aiTokenUsage.groupBy({
    by: ["module"],
    _sum: { totalTokens: true },
    orderBy: { _sum: { totalTokens: "desc" } },
  });

  return NextResponse.json({
    daily,
    modules: modules.map((m) => ({ module: m.module, tokens: m._sum.totalTokens ?? 0 })),
  });
}
