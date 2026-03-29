import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdminSession } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/invite-codes/[id] — 删除邀请码（仅 ADMIN） */
export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await ctx.params;

  try {
    const existing = await prisma.inviteCode.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ message: "邀请码不存在" }, { status: 404 });
    }

    await prisma.inviteCode.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[invite-codes] DELETE error:", e);
    return NextResponse.json(
      { message: "删除失败", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
