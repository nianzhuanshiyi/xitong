import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { encryptPassword } from "@/lib/mail/crypto";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  email: z.string().email("邮箱格式不正确"),
  displayName: z.string().max(100).optional().nullable(),
  imapHost: z.string().min(1, "请填写 IMAP 服务器"),
  imapPort: z.number().int().default(993),
  imapPassword: z.string().min(1, "请填写密码/授权码"),
  smtpHost: z.string().optional().nullable(),
  smtpPort: z.number().int().optional().nullable().default(465),
  smtpPassword: z.string().optional().nullable(),
});

/** GET /api/mail/accounts — 当前用户的邮箱列表 */
export async function GET() {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    const rows = await prisma.emailAccount.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
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
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json(rows);
  } catch (e) {
    console.error("[mail/accounts] GET error:", e);
    return NextResponse.json(
      { message: "查询失败", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** POST /api/mail/accounts — 添加邮箱账号 */
export async function POST(req: Request) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "无效的 JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "参数错误";
    return NextResponse.json({ message: first, issues: parsed.error.flatten() }, { status: 400 });
  }

  const { email, displayName, imapHost, imapPort, imapPassword, smtpHost, smtpPort, smtpPassword } = parsed.data;

  try {
    const existing = await prisma.emailAccount.findUnique({
      where: { userId_email: { userId: session.user.id, email } },
    });
    if (existing) {
      return NextResponse.json({ message: "该邮箱已添加过" }, { status: 409 });
    }

    const row = await prisma.emailAccount.create({
      data: {
        userId: session.user.id,
        email,
        displayName: displayName || null,
        imapHost,
        imapPort: imapPort ?? 993,
        imapPassword: encryptPassword(imapPassword),
        smtpHost: smtpHost || null,
        smtpPort: smtpPort ?? 465,
        smtpPassword: smtpPassword ? encryptPassword(smtpPassword) : null,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        imapHost: true,
        imapPort: true,
        smtpHost: true,
        smtpPort: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    console.error("[mail/accounts] POST error:", e);
    return NextResponse.json(
      { message: "添加失败", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
