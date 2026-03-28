import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { parseBundlePlanJson } from "@/lib/ai-images/bundle-resolve";
import { publicRoot } from "@/lib/ai-images/paths";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

async function getOwnedProject(userId: string, id: string) {
  return prisma.imageProject.findFirst({
    where: { id, userId },
    include: {
      generatedImages: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const row = await getOwnedProject(session.user.id, id);
  if (!row) {
    return NextResponse.json({ message: "项目不存在" }, { status: 404 });
  }
  const bundlePlan = parseBundlePlanJson(row.bundlePlanJson);
  const refs = JSON.parse(row.referencePathsJson || "[]") as string[];
  return NextResponse.json({
    ...row,
    bundlePlan,
    referenceUrls: refs.map((r) => `/${r.replace(/^\/+/, "")}`),
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const existing = await prisma.imageProject.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) {
    return NextResponse.json({ message: "项目不存在" }, { status: 404 });
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

  const row = await prisma.imageProject.update({
    where: { id },
    data: parsed.data,
  });
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const existing = await prisma.imageProject.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) {
    return NextResponse.json({ message: "项目不存在" }, { status: 404 });
  }

  await prisma.imageProject.delete({ where: { id } });

  const dir = path.join(publicRoot(), "uploads", "ai-images", id);
  try {
    await fs.promises.rm(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true });
}
