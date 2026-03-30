import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { error } = await requireModuleAccess("beauty-ideas");
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const market = searchParams.get("market");
  const category = searchParams.get("category");

  const where: Record<string, unknown> = {};
  if (market) where.market = market;
  if (category) where.category = category;

  const trends = await prisma.beautyTrend.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { _count: { select: { ideas: true } } },
  });

  return NextResponse.json({
    trends: trends.map((t) => ({
      ...t,
      ingredients: JSON.parse(t.ingredients),
      ideaCount: t._count.ideas,
    })),
  });
}
