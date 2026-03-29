import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  asin: z.string().max(20).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  targetMarket: z.string().max(10).optional(),
  status: z
    .enum(["idea", "research", "sampling", "testing", "listing", "launched", "abandoned"])
    .optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  description: z.string().max(5000).optional().nullable(),
  targetPrice: z.number().optional().nullable(),
  estimatedCost: z.number().optional().nullable(),
  estimatedProfit: z.number().optional().nullable(),
  moq: z.number().int().optional().nullable(),
  competitorAsins: z.string().optional().nullable(),
  marketSize: z.string().max(200).optional().nullable(),
  competitionLevel: z.string().max(50).optional().nullable(),
  supplierName: z.string().max(200).optional().nullable(),
  supplierContact: z.string().max(200).optional().nullable(),
  sampleStatus: z
    .enum(["not_ordered", "ordered", "received", "approved", "rejected"])
    .optional()
    .nullable(),
  sampleCost: z.number().optional().nullable(),
  diffPoints: z.string().max(2000).optional().nullable(),
  painPoints: z.string().max(2000).optional().nullable(),
  ideaDate: z.coerce.date().optional(),
  targetLaunchDate: z.coerce.date().optional().nullable(),
  actualLaunchDate: z.coerce.date().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  imageUrl: z.string().max(500).optional().nullable(),
});

/** GET /api/product-dev/[id] — 详情（含 tasks + logs） */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const row = await prisma.productDev.findUnique({
    where: { id },
    include: {
      tasks: { orderBy: { sortOrder: "asc" } },
      logs: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });

  if (!row) {
    return NextResponse.json({ message: "项目不存在" }, { status: 404 });
  }

  return NextResponse.json(row);
}

/** PATCH /api/product-dev/[id] — 更新 */
export async function PATCH(req: Request, ctx: Ctx) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const existing = await prisma.productDev.findUnique({ where: { id } });
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
      { status: 400 },
    );
  }

  const row = await prisma.productDev.update({
    where: { id },
    data: parsed.data,
  });

  // 记录变更日志
  const changedFields = Object.keys(parsed.data).join(", ");
  await prisma.productDevLog.create({
    data: {
      productId: id,
      action: "update",
      content: `更新字段: ${changedFields}`,
      createdBy: session.user.id,
    },
  });

  return NextResponse.json(row);
}

/** DELETE /api/product-dev/[id] — 删除（级联删除 tasks + logs） */
export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await ctx.params;

  const existing = await prisma.productDev.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ message: "项目不存在" }, { status: 404 });
  }

  await prisma.productDev.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
