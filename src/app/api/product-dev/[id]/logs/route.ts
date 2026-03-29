import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const createSchema = z.object({
  action: z.string().min(1).max(100),
  content: z.string().min(1).max(2000),
});

/** GET /api/product-dev/[id]/logs — 操作日志列表 */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const product = await prisma.productDev.findUnique({ where: { id } });
  if (!product) {
    return NextResponse.json({ message: "项目不存在" }, { status: 404 });
  }

  const rows = await prisma.productDevLog.findMany({
    where: { productId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(rows);
}

/** POST /api/product-dev/[id]/logs — 手动添加日志 */
export async function POST(req: Request, ctx: Ctx) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const product = await prisma.productDev.findUnique({ where: { id } });
  if (!product) {
    return NextResponse.json({ message: "项目不存在" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "无效的 JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "参数错误", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const row = await prisma.productDevLog.create({
    data: {
      productId: id,
      ...parsed.data,
      createdBy: session.user.id,
    },
  });

  return NextResponse.json(row, { status: 201 });
}
