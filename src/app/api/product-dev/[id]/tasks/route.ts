import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(["todo", "in_progress", "done"]).default("todo"),
  assignee: z.string().max(100).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  sortOrder: z.number().int().default(0),
});

/** GET /api/product-dev/[id]/tasks — 任务列表 */
export async function GET(_req: Request, ctx: Ctx) {
  const { session, error } = await requireModuleAccess("product-dev");
  if (error) return error;
  const userId = session.user.id;

  const { id } = await ctx.params;

  const product = await prisma.productDev.findUnique({ where: { id } });
  if (!product) {
    return NextResponse.json({ message: "项目不存在" }, { status: 404 });
  }

  if (product.createdBy !== userId) {
    return NextResponse.json({ message: "无权限访问该项目" }, { status: 403 });
  }

  const rows = await prisma.productDevTask.findMany({
    where: { productId: id },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(rows);
}

/** POST /api/product-dev/[id]/tasks — 新建任务 */
export async function POST(req: Request, ctx: Ctx) {
  const { session, error } = await requireModuleAccess("product-dev");
  if (error) return error;
  const userId = session.user.id;

  const { id } = await ctx.params;

  const product = await prisma.productDev.findUnique({ where: { id } });
  if (!product) {
    return NextResponse.json({ message: "项目不存在" }, { status: 404 });
  }

  if (product.createdBy !== userId) {
    return NextResponse.json({ message: "无权限操作该项目" }, { status: 403 });
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

  const row = await prisma.productDevTask.create({
    data: {
      productId: id,
      ...parsed.data,
    },
  });

  await prisma.productDevLog.create({
    data: {
      productId: id,
      action: "add_task",
      content: `添加任务「${row.title}」`,
      createdBy: userId,
    },
  });

  return NextResponse.json(row, { status: 201 });
}
