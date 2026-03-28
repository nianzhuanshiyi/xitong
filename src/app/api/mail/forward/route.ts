import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { z } from "zod";
import nodemailer from "nodemailer";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { mailEnvConfigured } from "@/lib/mail/config";
import { claudeTranslateZhToEnForMail } from "@/lib/mail/claude-mail";
import { buildOriginalMessageQuote, forwardSubject } from "@/lib/mail/compose-quote";
import { EmailDirection } from "@prisma/client";

const bodySchema = z.object({
  emailId: z.string().min(1),
  to: z.string().min(3).max(500),
  /** 转发备注（中文），可选 */
  noteZh: z.string().max(20_000).optional(),
});

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ message: "无效的 JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "参数错误", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { smtp } = mailEnvConfigured();
  if (!smtp) {
    return NextResponse.json(
      { message: "未配置 SMTP，无法转发" },
      { status: 503 }
    );
  }

  const row = await prisma.email.findFirst({
    where: { id: parsed.data.emailId, isDeleted: false },
    include: { attachments: true },
  });
  if (!row) {
    return NextResponse.json({ message: "邮件不存在" }, { status: 404 });
  }

  let noteBlock = "";
  let noteZhStored: string | null = null;
  if (parsed.data.noteZh?.trim()) {
    noteZhStored = parsed.data.noteZh.trim();
    const en = await claudeTranslateZhToEnForMail(noteZhStored);
    noteBlock = (en || noteZhStored) + "\n\n";
  }

  const quoted = buildOriginalMessageQuote({
    fromAddress: row.fromAddress,
    toAddress: row.toAddress,
    receivedAt: row.receivedAt,
    subject: row.subject,
    bodyText: row.bodyText || "",
  });

  const bodyEn = `${noteBlock}${quoted}`;

  const user = process.env.EMAIL_USER!.trim();
  const pass = process.env.EMAIL_AUTH_CODE!.trim();
  const host = process.env.SMTP_HOST!.trim();
  const port = Number(process.env.SMTP_PORT?.trim() || "465");

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });

  const attachments: {
    filename: string;
    content: Buffer;
    contentType: string;
  }[] = [];
  for (const a of row.attachments) {
    const rel = a.storagePath.replace(/^\/+/, "");
    const abs = path.join(process.cwd(), "public", rel);
    try {
      const content = await fs.readFile(abs);
      attachments.push({
        filename: a.filename,
        content,
        contentType: a.contentType,
      });
    } catch {
      console.warn("[forward] 附件缺失，跳过:", abs);
    }
  }

  const subject = forwardSubject(row.subject);

  const info = await transporter.sendMail({
    from: user,
    to: parsed.data.to.trim(),
    subject,
    text: bodyEn,
    attachments: attachments.length ? attachments : undefined,
  });

  const messageId =
    typeof info.messageId === "string"
      ? info.messageId.replace(/[<>]/g, "")
      : `fwd-${Date.now()}`;

  await prisma.email.create({
    data: {
      messageId,
      inReplyTo: null,
      referencesIds: null,
      direction: EmailDirection.SENT,
      fromAddress: user,
      toAddress: parsed.data.to.trim(),
      subject,
      bodyText: bodyEn,
      bodyHtml: null,
      bodyZh: noteZhStored,
      receivedAt: new Date(),
      supplierId: row.supplierId,
      isRead: true,
      isClassified: Boolean(row.supplierId),
      hasAttachments: attachments.length > 0,
      summaryCn: "（已转发）",
    },
  });

  return NextResponse.json({ ok: true, messageId: info.messageId });
}
