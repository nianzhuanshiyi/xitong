import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const recommendation = searchParams.get("recommendation");
  const category = searchParams.get("category");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (recommendation) where.recommendation = recommendation;
  if (category) where.category = category;

  const ideas = await prisma.europeProductIdea.findMany({
    where,
    orderBy: { totalScore: "desc" },
    take: 100,
    include: {
      trend: { select: { title: true, market: true } },
      _count: { select: { comments: true } },
    },
  });

  return NextResponse.json({
    ideas: ideas.map((i) => ({
      ...i,
      keyFeatures: JSON.parse(i.keyFeatures),
      sellingPoints: JSON.parse(i.sellingPoints),
      topCompetitors: JSON.parse(i.topCompetitors),
      commentCount: i._count.comments,
    })),
  });
}
