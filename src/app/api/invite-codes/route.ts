import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAdminSession } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  code: z.string().min(4).max(20),
  maxUses: z.number().int().min(1).default(10),
  expiresAt: z.coerce.date().optional().nullable(),
});

/** GET /api/invite-codes — 邀请码列表（仅 ADMIN） */
export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  try {
    const rows = await prisma.inviteCode.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(rows);
  } catch (e) {
    console.error("[invite-codes] GET error:", e);
    return NextResponse.json(
      { message: "查询失败", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** POST /api/invite-codes — 创建邀请码（仅 ADMIN） */
export async function POST(req: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
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

  try {
    const existing = await prisma.inviteCode.findUnique({
      where: { code: parsed.data.code },
    });
    if (existing) {
      return NextResponse.json({ message: "邀请码已存在" }, { status: 409 });
    }

    const row = await prisma.inviteCode.create({
      data: parsed.data,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    console.error("[invite-codes] POST error:", e);
    return NextResponse.json(
      { message: "创建失败", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
