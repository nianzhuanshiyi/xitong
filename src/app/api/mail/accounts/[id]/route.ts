import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { encryptPassword } from "@/lib/mail/crypto";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  displayName: z.string().max(100).optional().nullable(),
  imapHost: z.string().min(1).optional(),
  imapPort: z.number().int().optional(),
  imapPassword: z.string().min(1).optional(),
  smtpHost: z.string().optional().nullable(),
  smtpPort: z.number().int().optional().nullable(),
  smtpPassword: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

async function getOwnAccount(userId: string, id: string) {
  return prisma.emailAccount.findFirst({ where: { id, userId } });
}

/** PATCH /api/mail/accounts/[id] — 编辑邮箱 */
export async function PATCH(req: Request, ctx: Ctx) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = await getOwnAccount(session.user.id, id);
  if (!existing) {
    return NextResponse.json({ message: "邮箱不存在" }, { status: 404 });
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

  try {
    const data: Record<string, unknown> = { ...parsed.data };

    // 加密密码字段
    if (parsed.data.imapPassword) {
      data.imapPassword = encryptPassword(parsed.data.imapPassword);
    }
    if (parsed.data.smtpPassword) {
      data.smtpPassword = encryptPassword(parsed.data.smtpPassword);
    }

    const row = await prisma.emailAccount.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        displayName: true,
        imapHost: true,
        imapPort: true,
        smtpHost: true,
        smtpPort: true,
        isActive: true,
        lastSyncAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(row);
  } catch (e) {
    console.error("[mail/accounts] PATCH error:", e);
    return NextResponse.json(
      { message: "更新失败", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** DELETE /api/mail/accounts/[id] — 删除邮箱 */
export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = await getOwnAccount(session.user.id, id);
  if (!existing) {
    return NextResponse.json({ message: "邮箱不存在" }, { status: 404 });
  }

  try {
    await prisma.emailAccount.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[mail/accounts] DELETE error:", e);
    return NextResponse.json(
      { message: "删除失败", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
