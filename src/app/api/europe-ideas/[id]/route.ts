import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { session, error } = await requireModuleAccess("europe-ideas");
  if (error) return error;
  const userId = session.user.id;

  const { id } = await ctx.params;
  const idea = await prisma.europeProductIdea.findUnique({
    where: { id },
    include: {
      trend: true,
      comments: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });

  if (!idea || idea.createdBy !== userId) {
    return NextResponse.json({ message: "创意不存在" }, { status: 404 });
  }

  return NextResponse.json({
    ...idea,
    keyFeatures: JSON.parse(idea.keyFeatures),
    sellingPoints: JSON.parse(idea.sellingPoints),
    topCompetitors: JSON.parse(idea.topCompetitors),
    trend: idea.trend
      ? { ...idea.trend, keywords: JSON.parse(idea.trend.keywords) }
      : null,
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { session, error } = await requireModuleAccess("europe-ideas");
  if (error) return error;
  const userId = session.user.id;

  const { id } = await ctx.params;

  const existing = await prisma.europeProductIdea.findUnique({ where: { id } });
  if (!existing || existing.createdBy !== userId) {
    return NextResponse.json({ message: "创意不存在" }, { status: 404 });
  }

  const body = (await req.json()) as { status?: string };

  const validStatuses = ["draft", "validated", "developing", "abandoned"];
  if (body.status && !validStatuses.includes(body.status)) {
    return NextResponse.json({ message: "无效状态" }, { status: 400 });
  }

  const updated = await prisma.europeProductIdea.update({
    where: { id },
    data: { ...(body.status ? { status: body.status } : {}) },
  });

  return NextResponse.json({ ok: true, status: updated.status });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { session, error } = await requireModuleAccess("europe-ideas");
  if (error) return error;
  const userId = session.user.id;

  const { id } = await ctx.params;

  const existing = await prisma.europeProductIdea.findUnique({ where: { id } });
  if (!existing || existing.createdBy !== userId) {
    return NextResponse.json({ message: "创意不存在" }, { status: 404 });
  }

  await prisma.europeProductIdea.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
