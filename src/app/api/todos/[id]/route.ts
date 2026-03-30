import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { mailUiMock } from "@/lib/mail/config";
import { MailPriority } from "@prisma/client";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  isCompleted: z.boolean().optional(),
  priority: z.enum(["URGENT", "NORMAL", "LOW"]).optional(),
  content: z.string().min(1).max(2000).optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { session, error } = await requireModuleAccess("todos");
  if (error) return error;
  const { id } = await ctx.params;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ message: "无效的 JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "参数错误", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (mailUiMock()) {
    return NextResponse.json({ ok: true, mock: true });
  }

  const row = await prisma.actionItem.findFirst({ where: { id, userId: session!.user.id } });
  if (!row) {
    return NextResponse.json({ message: "待办不存在" }, { status: 404 });
  }

  const data: {
    isCompleted?: boolean;
    priority?: MailPriority;
    content?: string;
    dueDate?: Date | null;
    completedAt?: Date | null;
  } = {};

  if (parsed.data.isCompleted !== undefined) {
    data.isCompleted = parsed.data.isCompleted;
    data.completedAt = parsed.data.isCompleted ? new Date() : null;
  }
  if (parsed.data.priority) {
    data.priority = parsed.data.priority as MailPriority;
  }
  if (parsed.data.content) data.content = parsed.data.content;
  if (parsed.data.dueDate !== undefined) {
    data.dueDate = parsed.data.dueDate
      ? new Date(parsed.data.dueDate)
      : null;
  }

  const updated = await prisma.actionItem.update({
    where: { id },
    data,
  });
  return NextResponse.json(updated);
}
