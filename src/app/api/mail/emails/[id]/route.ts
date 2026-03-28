import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { mailUiMock } from "@/lib/mail/config";
import { MOCK_MAIL_DETAILS } from "@/lib/mail/fixtures";
import { emailDetail } from "@/lib/mail/dto";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  isDeleted: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const { id } = await ctx.params;

  if (mailUiMock()) {
    const d = MOCK_MAIL_DETAILS[id];
    if (!d) {
      return NextResponse.json({ message: "邮件不存在" }, { status: 404 });
    }
    return NextResponse.json(d);
  }

  const row = await prisma.email.findFirst({
    where: { id, isDeleted: false },
    include: {
      actionItems: true,
      attachments: true,
      supplier: { select: { name: true } },
    },
  });
  if (!row) {
    return NextResponse.json({ message: "邮件不存在" }, { status: 404 });
  }
  return NextResponse.json(emailDetail(row));
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const { id } = await ctx.params;

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

  if (mailUiMock()) {
    return NextResponse.json({ ok: true, mock: true });
  }

  const row = await prisma.email.findFirst({ where: { id, isDeleted: false } });
  if (!row) {
    return NextResponse.json({ message: "邮件不存在" }, { status: 404 });
  }

  const updated = await prisma.email.update({
    where: { id },
    data: parsed.data,
  });
  return NextResponse.json(updated);
}
