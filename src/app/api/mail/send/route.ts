import { NextResponse } from "next/server";
import { z } from "zod";
import nodemailer from "nodemailer";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { mailEnvConfigured } from "@/lib/mail/config";
import { claudeTranslateZhToEnForMail } from "@/lib/mail/claude-mail";
import { buildOriginalMessageQuote } from "@/lib/mail/compose-quote";
import { EmailDirection } from "@prisma/client";
import { decryptPassword } from "@/lib/mail/crypto";

const attachmentSchema = z.object({
  filename: z.string().min(1).max(500),
  contentType: z.string().min(1).max(200),
  contentBase64: z.string().min(1).max(25_000_000),
});

const previewSchema = z.object({
  phase: z.literal("preview"),
  to: z.string().min(3),
  subject: z.string().min(1).max(500),
  bodyZh: z.string().min(1).max(50_000),
});

const sendSchema = z.object({
  phase: z.literal("send"),
  to: z.string().min(3),
  cc: z.string().max(2000).optional(),
  bcc: z.string().max(2000).optional(),
  subject: z.string().min(1).max(500),
  bodyEn: z.string().min(1).max(50_000),
  /** 用户中文原文，入库保存 */
  bodyZh: z.string().max(50_000).optional(),
  replyToEmailId: z.string().optional(),
  supplierId: z.string().optional(),
  attachments: z.array(attachmentSchema).max(20).optional(),
  /** 指定发件邮箱账号 ID */
  accountId: z.string().optional(),
});

export const dynamic = "force-dynamic";

function wrapMessageId(id: string): string {
  const t = id.trim();
  if (t.startsWith("<") && t.endsWith(">")) return t;
  return `<${t}>`;
}

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

  const p = previewSchema.safeParse(json);
  if (p.success) {
    const en = await claudeTranslateZhToEnForMail(p.data.bodyZh);
    if (!en) {
      return NextResponse.json(
        { message: "翻译失败或未配置 Claude" },
        { status: 503 }
      );
    }
    return NextResponse.json({ phase: "preview", bodyEn: en });
  }

  const s = sendSchema.safeParse(json);
  if (!s.success) {
    return NextResponse.json(
      { message: "参数错误", issues: s.error.flatten() },
      { status: 400 }
    );
  }

  // Resolve SMTP credentials: prefer accountId, fallback to env vars
  let user: string;
  let pass: string;
  let host: string;
  let port: number;

  if (s.data.accountId) {
    const account = await prisma.emailAccount.findFirst({
      where: { id: s.data.accountId, userId: session.user.id, isActive: true },
    });
    if (!account || !account.smtpHost) {
      return NextResponse.json(
        { message: "邮箱账号不存在或未配置 SMTP" },
        { status: 400 }
      );
    }
    user = account.email;
    pass = decryptPassword(account.smtpPassword || account.imapPassword);
    host = account.smtpHost;
    port = account.smtpPort ?? 465;
  } else {
    const { smtp } = mailEnvConfigured();
    if (!smtp) {
      return NextResponse.json(
        {
          ok: false,
          message: "未配置 SMTP，无法发信（已生成英文稿可手动复制）",
          bodyEn: s.data.bodyEn,
        },
        { status: 503 }
      );
    }
    user = process.env.EMAIL_USER!.trim();
    pass = process.env.EMAIL_AUTH_CODE!.trim();
    host = process.env.SMTP_HOST!.trim();
    port = Number(process.env.SMTP_PORT?.trim() || "465");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });

  let inReplyTo: string | undefined;
  let references: string | undefined;
  let bodyEn = s.data.bodyEn;

  if (s.data.replyToEmailId) {
    const ref = await prisma.email.findFirst({
      where: { id: s.data.replyToEmailId, isDeleted: false },
      select: {
        messageId: true,
        referencesIds: true,
        fromAddress: true,
        toAddress: true,
        receivedAt: true,
        subject: true,
        bodyText: true,
      },
    });
    if (ref?.messageId) {
      inReplyTo = wrapMessageId(ref.messageId);
      const chain = [ref.referencesIds?.trim(), ref.messageId]
        .filter(Boolean)
        .join(" ")
        .trim();
      references = chain
        ? chain
            .split(/\s+/)
            .map((x) => wrapMessageId(x.replace(/[<>]/g, "")))
            .join(" ")
        : inReplyTo;
      bodyEn += buildOriginalMessageQuote({
        fromAddress: ref.fromAddress,
        toAddress: ref.toAddress,
        receivedAt: ref.receivedAt,
        subject: ref.subject,
        bodyText: ref.bodyText || "",
      });
    }
  }

  const nodemailerAttachments =
    s.data.attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.contentBase64, "base64"),
      contentType: a.contentType,
    })) ?? [];

  let info: Awaited<ReturnType<typeof transporter.sendMail>>;
  try {
    info = await transporter.sendMail({
      from: user,
      to: s.data.to,
      cc: s.data.cc || undefined,
      bcc: s.data.bcc || undefined,
      subject: s.data.subject,
      text: bodyEn,
      inReplyTo,
      references,
      attachments: nodemailerAttachments.length ? nodemailerAttachments : undefined,
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
    return NextResponse.json(
      { message: `SMTP 发送失败：${msg}` },
      { status: 502 }
    );
  }

  const messageId =
    typeof info.messageId === "string"
      ? info.messageId.replace(/[<>]/g, "")
      : `sent-${Date.now()}`;

  await prisma.email.create({
    data: {
      messageId,
      inReplyTo: inReplyTo ? inReplyTo.replace(/[<>]/g, "") : null,
      referencesIds: references ?? null,
      direction: EmailDirection.SENT,
      fromAddress: user,
      toAddress: s.data.to,
      subject: s.data.subject,
      bodyText: bodyEn,
      bodyHtml: null,
      bodyZh: s.data.bodyZh?.trim() || null,
      receivedAt: new Date(),
      supplierId: s.data.supplierId ?? null,
      isRead: true,
      isClassified: Boolean(s.data.supplierId),
      hasAttachments: nodemailerAttachments.length > 0,
      summaryCn: "（已发送）",
    },
  });

  return NextResponse.json({ ok: true, messageId: info.messageId });
}
