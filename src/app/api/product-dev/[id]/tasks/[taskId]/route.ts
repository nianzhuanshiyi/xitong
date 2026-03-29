import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; taskId: string }> };

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  assignee: z.string().max(100).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

/** PATCH /api/product-dev/[id]/tasks/[taskId] — 更新任务 */
export async function PATCH(req: Request, ctx: Ctx) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { id, taskId } = await ctx.params;

  const task = await prisma.productDevTask.findFirst({
    where: { id: taskId, productId: id },
  });
  if (!task) {
    return NextResponse.json({ message: "任务不存在" }, { status: 404 });
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

  const row = await prisma.productDevTask.update({
    where: { id: taskId },
    data: parsed.data,
  });

  await prisma.productDevLog.create({
    data: {
      productId: id,
      action: "update_task",
      content: `更新任务「${row.title}」`,
      createdBy: session.user.id,
    },
  });

  return NextResponse.json(row);
}

/** DELETE /api/product-dev/[id]/tasks/[taskId] — 删除任务 */
export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { id, taskId } = await ctx.params;

  const task = await prisma.productDevTask.findFirst({
    where: { id: taskId, productId: id },
  });
  if (!task) {
    return NextResponse.json({ message: "任务不存在" }, { status: 404 });
  }

  await prisma.productDevTask.delete({ where: { id: taskId } });

  await prisma.productDevLog.create({
    data: {
      productId: id,
      action: "delete_task",
      content: `删除任务「${task.title}」`,
      createdBy: session.user.id,
    },
  });

  return NextResponse.json({ ok: true });
}
