import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { decryptPassword } from "@/lib/mail/crypto";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/mail/accounts/[id]/test — 测试 IMAP/SMTP 连接 */
export async function POST(_req: Request, ctx: Ctx) {
  const { session, error } = await requireModuleAccess("email");
  if (error) return error;

  const { id } = await ctx.params;
  const account = await prisma.emailAccount.findFirst({
    where: { id, userId: session!.user.id },
  });
  if (!account) {
    return NextResponse.json({ message: "邮箱不存在" }, { status: 404 });
  }

  const results: { imap: { ok: boolean; message: string }; smtp: { ok: boolean; message: string } } = {
    imap: { ok: false, message: "" },
    smtp: { ok: false, message: "" },
  };

  // Test IMAP
  let imapPass: string;
  try {
    imapPass = decryptPassword(account.imapPassword);
  } catch {
    results.imap = { ok: false, message: "密码解密失败，请重新设置密码" };
    results.smtp = { ok: false, message: "跳过（IMAP 密码解密失败）" };
    return NextResponse.json(results);
  }

  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: true,
    auth: { user: account.email, pass: imapPass },
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    results.imap = { ok: true, message: "IMAP 连接成功" };
    await client.logout();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    results.imap = { ok: false, message: `IMAP 连接失败: ${msg}` };
  }

  // Test SMTP
  if (account.smtpHost) {
    try {
      const nodemailer = await import("nodemailer");
      const smtpPass = account.smtpPassword
        ? decryptPassword(account.smtpPassword)
        : imapPass;
      const smtpPort = account.smtpPort ?? 465;
      const transporter = nodemailer.default.createTransport({
        host: account.smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: account.email, pass: smtpPass },
        tls: { rejectUnauthorized: false },
      });
      await transporter.verify();
      results.smtp = { ok: true, message: "SMTP 连接成功" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.smtp = { ok: false, message: `SMTP 连接失败: ${msg}` };
    }
  } else {
    results.smtp = { ok: false, message: "未配置 SMTP 服务器" };
  }

  return NextResponse.json(results);
}
