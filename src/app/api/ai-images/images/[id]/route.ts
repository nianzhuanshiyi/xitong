import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { publicRoot } from "@/lib/ai-images/paths";

const patchSchema = z.object({
  isFavorite: z.boolean().optional(),
  sortPosition: z.number().int().min(0).max(6).nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const row = await prisma.generatedImage.findFirst({
    where: { id },
    include: { project: true },
  });
  if (!row || row.project.userId !== session.user.id) {
    return NextResponse.json({ message: "图片不存在" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "无效的 JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "参数错误", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updated = await prisma.generatedImage.update({
    where: { id },
    data: parsed.data,
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const row = await prisma.generatedImage.findFirst({
    where: { id },
    include: { project: true },
  });
  if (!row || row.project.userId !== session.user.id) {
    return NextResponse.json({ message: "图片不存在" }, { status: 404 });
  }

  const abs = path.join(publicRoot(), row.filePath.replace(/^\/+/, ""));
  try {
    await fs.promises.unlink(abs);
  } catch {
    /* ignore */
  }

  await prisma.generatedImage.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
