import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { session, error } = await requireModuleAccess("beauty-ideas");
  if (error) return error;

  const { id } = await ctx.params;
  const idea = await prisma.productIdea.findUnique({
    where: { id },
    include: {
      trend: true,
      comments: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });

  if (!idea) {
    return NextResponse.json({ message: "创意不存在" }, { status: 404 });
  }

  if (idea.createdBy !== session!.user.id) {
    return NextResponse.json({ message: "无权访问" }, { status: 403 });
  }

  return NextResponse.json({
    ...idea,
    keyIngredients: JSON.parse(idea.keyIngredients),
    sellingPoints: JSON.parse(idea.sellingPoints),
    topCompetitors: JSON.parse(idea.topCompetitors),
    trend: idea.trend
      ? { ...idea.trend, ingredients: JSON.parse(idea.trend.ingredients) }
      : null,
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { session, error } = await requireModuleAccess("beauty-ideas");
  if (error) return error;

  const { id } = await ctx.params;

  const existing = await prisma.productIdea.findUnique({ where: { id }, select: { createdBy: true } });
  if (!existing) {
    return NextResponse.json({ message: "创意不存在" }, { status: 404 });
  }
  if (existing.createdBy !== session!.user.id) {
    return NextResponse.json({ message: "无权操作" }, { status: 403 });
  }

  const body = (await req.json()) as { status?: string };

  const validStatuses = ["draft", "validated", "developing", "abandoned"];
  if (body.status && !validStatuses.includes(body.status)) {
    return NextResponse.json({ message: "无效状态" }, { status: 400 });
  }

  const updated = await prisma.productIdea.update({
    where: { id },
    data: { ...(body.status ? { status: body.status } : {}) },
  });

  return NextResponse.json({ ok: true, status: updated.status });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { session, error } = await requireModuleAccess("beauty-ideas");
  if (error) return error;

  const { id } = await ctx.params;

  const existing = await prisma.productIdea.findUnique({ where: { id }, select: { createdBy: true } });
  if (!existing) {
    return NextResponse.json({ message: "创意不存在" }, { status: 404 });
  }
  if (existing.createdBy !== session!.user.id) {
    return NextResponse.json({ message: "无权操作" }, { status: 403 });
  }

  await prisma.productIdea.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
