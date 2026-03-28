import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import prisma from "@/lib/prisma";
import { EmailDirection, MailPriority } from "@prisma/client";
import {
  extractDomainFromAddress,
  isPublicEmailDomain,
} from "@/lib/mail/public-domains";
import type { MailSyncStreamEvent } from "@/lib/mail/sync-stream-types";
import type { MailSummaryJson } from "@/lib/mail/claude-mail";

/**
 * 临时联调：设为 true 时用下方字面量连接 IMAP，排除 .env 对 `$` 的解析问题。
 * 确认能连上后务必改回 false，并删除硬编码密码。
 */
const IMAP_USE_HARDCODED_AUTH_FOR_DEBUG = true;

function priorityFrom(s: string): MailPriority {
  if (s === "urgent") return MailPriority.URGENT;
  if (s === "low") return MailPriority.LOW;
  return MailPriority.NORMAL;
}

export type SyncProgressPayload = MailSyncStreamEvent;

/** 将 ImapFlow / 底层错误展开到终端，便于排查 auth / TLS / 网络 */
function logImapDiagnostics(prefix: string, e: unknown) {
  const err = e as Record<string, unknown> & {
    message?: string;
    stack?: string;
    code?: string;
    errno?: number;
    syscall?: string;
    address?: string;
    port?: number;
  };
  const authFailed = err.authenticationFailed === true;
  const tlsFailed = err.tlsFailed === true;
  let kind = "未知";
  if (authFailed) kind = "认证失败（账号/授权码/IMAP 未开启）";
  else if (tlsFailed) kind = "TLS/证书握手问题";
  else if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT")
    kind = "TCP 连接被拒或超时";
  else if (typeof err.responseStatus === "string")
    kind = `IMAP 响应 ${err.responseStatus}`;

  const payload = {
    kind,
    message: err.message ?? String(e),
    authenticationFailed: err.authenticationFailed,
    responseStatus: err.responseStatus,
    responseText: err.responseText,
    serverResponseCode: err.serverResponseCode,
    code: err.code,
    errno: err.errno,
    syscall: err.syscall,
    address: err.address,
    port: err.port,
    tlsFailed: err.tlsFailed,
  };

  console.log(`[IMAP] ${prefix} — 错误分类:`, kind);
  console.log("[IMAP] 错误详情 JSON:", JSON.stringify(payload, null, 2));
  if (err.stack) console.log("[IMAP] stack:\n", err.stack);
  console.log("[IMAP] 原始错误对象 keys:", e && typeof e === "object" ? Object.keys(e) : []);
}

async function resolveSupplierId(fromAddr: string): Promise<string | null> {
  const domain = extractDomainFromAddress(fromAddr);
  if (domain && !isPublicEmailDomain(domain)) {
    const row = await prisma.supplierDomain.findUnique({
      where: { domain },
      select: { supplierId: true },
    });
    if (row) return row.supplierId;
  }
  const trimmed = fromAddr.trim();
  const contact = await prisma.supplierContact.findFirst({
    where: { email: trimmed },
    select: { supplierId: true },
  });
  if (contact) return contact.supplierId;
  const lower = trimmed.toLowerCase();
  const contacts = await prisma.supplierContact.findMany({
    where: { email: { not: null } },
    select: { supplierId: true, email: true },
    take: 800,
  });
  const hit = contacts.find((c) => c.email?.trim().toLowerCase() === lower);
  return hit?.supplierId ?? null;
}

/**
 * IMAP 同步：默认只拉取最近 N 天（测试用），入库后对每封新邮件跑 AI 摘要。
 */
export async function runImapSync(options?: {
  onProgress?: (p: SyncProgressPayload) => void;
  /** 只同步此日期之后的邮件，默认读 MAIL_SYNC_SINCE_DAYS 或 7 */
  sinceDays?: number;
}): Promise<{
  imported: number;
  analyzed: number;
  aiSkipped?: number;
  aiFailed?: number;
  error?: string;
  errorStack?: string;
  note?: string;
}> {
  const emit = options?.onProgress ?? (() => {});
  const sinceDays =
    options?.sinceDays ??
    Number(process.env.MAIL_SYNC_SINCE_DAYS?.trim() || "7");

  const host =
    process.env.IMAP_HOST?.trim() || "imap.qiye.163.com";
  const port = Number(process.env.IMAP_PORT?.trim() || "993");
  /** 网易企业邮 IMAP 标准端口 993，使用 SSL/TLS 直连 */
  const secure = true;

  const user = IMAP_USE_HARDCODED_AUTH_FOR_DEBUG
    ? "ceo@zavyrabeauty.com"
    : (process.env.EMAIL_USER?.trim() ?? "");
  const pass = IMAP_USE_HARDCODED_AUTH_FOR_DEBUG
    ? "D7mDWPWtF@bTx9wT"
    : (process.env.EMAIL_AUTH_CODE?.trim() ?? "");

  if (!host || !user || !pass) {
    const msg = "未配置 IMAP_HOST / EMAIL_USER / EMAIL_AUTH_CODE";
    emit({ phase: "error", message: msg });
    return { imported: 0, analyzed: 0, error: msg };
  }

  await prisma.imapSyncState.upsert({
    where: { emailAccount: user },
    create: { emailAccount: user, lastUid: 0, status: "active" },
    update: {},
  });

  console.log("[IMAP] 准备连接:", {
    host,
    port,
    secure,
    sslTls: secure ? "是（ImapFlow secure + TLS 直连）" : "否",
    user,
    authCodeLength: pass.length,
    authSource: IMAP_USE_HARDCODED_AUTH_FOR_DEBUG
      ? "hardcoded-debug（联调完请改回环境变量）"
      : "env",
  });

  const client = new ImapFlow({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    logger: false,
    tls: {
      rejectUnauthorized: false,
    },
  });

  let imported = 0;
  let analyzed = 0;
  const newEmailIds: string[] = [];
  let imapError: string | null = null;
  let imapErrorStack: string | undefined;
  /** 搜索窗口内一封 UID 都没有（已 emit done） */
  let inboxHadNoUids = false;

  try {
    emit({ phase: "connect", message: "连接中…" });
    await client.connect();
    console.log("[IMAP] 连接成功:", { host, port, secure, user });

    const lock: Awaited<ReturnType<ImapFlow["getMailboxLock"]>> | undefined =
      await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - sinceDays * 86400000);
      emit({
        phase: "fetch",
        message: `拉取邮件（最近 ${sinceDays} 天）…`,
      });

      const raw = await client.search({ since });
      const uids = Array.isArray(raw) ? [...raw].sort((a, b) => a - b) : [];

      if (uids.length === 0) {
        await prisma.imapSyncState.update({
          where: { emailAccount: user },
          data: { lastSyncAt: new Date() },
        });
        const note = `最近 ${sinceDays} 天内无邮件`;
        emit({
          phase: "done",
          imported: 0,
          analyzed: 0,
          note,
          message: "完成（共 0 封）",
        });
        inboxHadNoUids = true;
      } else {
        let fetchIdx = 0;
        for await (const msg of client.fetch(uids, {
          uid: true,
          source: true,
        })) {
          fetchIdx += 1;
          emit({
            phase: "fetch",
            message: "拉取邮件…",
            current: fetchIdx,
            total: uids.length,
          });

          if (!msg.source || !msg.uid) continue;

          const parsed = await simpleParser(msg.source);
          const messageId =
            parsed.messageId?.replace(/[<>]/g, "") ||
            `gen-${user}-${msg.uid}-${Date.now()}`;

          const exists = await prisma.email.findUnique({
            where: { messageId },
            select: { id: true },
          });
          if (exists) continue;

          const fromAddr =
            parsed.from?.value?.[0]?.address ||
            parsed.from?.text ||
            "unknown@unknown";
          const toAddr = parsed.to?.value?.[0]?.address || user;
          const supplierId = await resolveSupplierId(fromAddr);
          const bodyText = parsed.text || "";
          const bodyHtml =
            typeof parsed.html === "string" ? parsed.html : null;

          const refs = parsed.references;
          const referencesIds =
            refs == null
              ? null
              : typeof refs === "string"
                ? refs
                : Array.isArray(refs)
                  ? refs.join(" ")
                  : String(refs);

          const inReply =
            typeof parsed.inReplyTo === "string"
              ? parsed.inReplyTo.replace(/[<>]/g, "")
              : null;

          const row = await prisma.email.create({
            data: {
              messageId,
              inReplyTo: inReply,
              referencesIds,
              direction: EmailDirection.RECEIVED,
              fromAddress: fromAddr,
              toAddress: toAddr,
              subject: parsed.subject || "(no subject)",
              bodyText,
              bodyHtml,
              receivedAt: parsed.date ?? new Date(),
              supplierId,
              isClassified: Boolean(supplierId),
              imapUid: msg.uid,
              hasAttachments: Boolean(parsed.attachments?.length),
              priority: MailPriority.NORMAL,
              tagsJson: "[]",
              summaryCn: null,
              bodyZh: null,
              aiBucket: supplierId ? null : "other",
            },
          });

          newEmailIds.push(row.id);
          imported += 1;
        }

        const maxUid = uids.length ? Math.max(...uids) : 0;
        if (maxUid > 0) {
          const st = await prisma.imapSyncState.findUnique({
            where: { emailAccount: user },
          });
          const nextLast = Math.max(st?.lastUid ?? 0, maxUid);
          await prisma.imapSyncState.update({
            where: { emailAccount: user },
            data: { lastUid: nextLast, lastSyncAt: new Date() },
          });
        } else {
          await prisma.imapSyncState.update({
            where: { emailAccount: user },
            data: { lastSyncAt: new Date() },
          });
        }
      }
    } finally {
      lock?.release();
    }
  } catch (e) {
    logImapDiagnostics("IMAP 同步异常（外层 catch）", e);
    const message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    emit({ phase: "error", message, stack });
    imapError = message;
    imapErrorStack = stack;
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }

  if (imapError) {
    return {
      imported,
      analyzed,
      error: imapError,
      errorStack: imapErrorStack,
    };
  }

  if (inboxHadNoUids) {
    return {
      imported: 0,
      analyzed: 0,
      note: `最近 ${sinceDays} 天内无邮件`,
    };
  }

  if (newEmailIds.length === 0) {
    const note = `最近 ${sinceDays} 天内无新邮件（或均已入库）`;
    emit({
      phase: "done",
      imported: 0,
      analyzed: 0,
      note,
      message: "完成（共 0 封）",
    });
    return { imported: 0, analyzed: 0, note };
  }

  const totalAi = newEmailIds.length;
  let aiSuccess = 0;
  let aiSkipped = 0;
  let aiFailed = 0;

  emit({
    phase: "ai",
    message: "AI 分析中…",
    current: 0,
    total: totalAi,
  });

  for (let i = 0; i < newEmailIds.length; i++) {
    const id = newEmailIds[i]!;
    const r = await applyAiSummaryToEmail(id);
    if (r === "success" || r === "already") aiSuccess += 1;
    else if (r === "skipped_empty" || r === "skipped_short") aiSkipped += 1;
    else if (r === "failed") aiFailed += 1;

    emit({
      phase: "ai",
      message: "AI 分析中…",
      current: i + 1,
      total: totalAi,
    });
  }

  analyzed = aiSuccess;
  const note =
    imported === 0
      ? `最近 ${sinceDays} 天内无新邮件（或均已入库）`
      : `新入库 ${imported} 封；AI：成功 ${aiSuccess} 封，跳过 ${aiSkipped} 封，失败 ${aiFailed} 封`;

  emit({
    phase: "done",
    imported,
    analyzed: aiSuccess,
    aiSkipped,
    aiFailed,
    note,
    message: `完成（共 ${imported} 封）`,
  });

  return {
    imported,
    analyzed: aiSuccess,
    aiSkipped,
    aiFailed,
    note,
  };
}

/** 单封邮件摘要：空/过短跳过 Claude；失败不抛错，由调用方统计 */
export type AiEmailSummaryApplyResult =
  | "success"
  | "already"
  | "skipped_empty"
  | "skipped_short"
  | "failed";

export async function applyAiSummaryToEmail(
  emailId: string,
  options?: { force?: boolean }
): Promise<AiEmailSummaryApplyResult> {
  const { claudeSummarizeEmail } = await import("./claude-mail");
  const email = await prisma.email.findUnique({ where: { id: emailId } });
  if (!email) return "failed";

  const force = Boolean(options?.force);
  if (
    !force &&
    email.summaryCn?.trim() &&
    email.bodyZh?.trim()
  ) {
    return "already";
  }

  const body = (email.bodyText ?? "").trim();
  if (body.length === 0) {
    try {
      await prisma.email.update({
        where: { id: emailId },
        data: { summaryCn: "（无正文内容，仅包含附件）" },
      });
    } catch (e) {
      console.error("[applyAiSummaryToEmail] 写入空正文摘要失败", emailId, e);
      return "failed";
    }
    return "skipped_empty";
  }
  if (body.length < 10) {
    try {
      await prisma.email.update({
        where: { id: emailId },
        data: { summaryCn: "（邮件内容过短）" },
      });
    } catch (e) {
      console.error("[applyAiSummaryToEmail] 写入过短摘要失败", emailId, e);
      return "failed";
    }
    return "skipped_short";
  }

  let ai: MailSummaryJson | null = null;
  try {
    ai = await claudeSummarizeEmail(body);
  } catch (e) {
    console.error("[applyAiSummaryToEmail] Claude 调用异常", emailId, e);
    return "failed";
  }
  if (!ai) {
    console.warn("[applyAiSummaryToEmail] Claude 返回空", emailId);
    return "failed";
  }

  const bodyZhFull =
    (ai!.body_zh || "").trim() ||
    (ai!.summary || "").trim() ||
    null;

  try {
    await prisma.$transaction(async (tx) => {
      if (force) {
        await tx.actionItem.deleteMany({ where: { emailId } });
      }
      await tx.email.update({
        where: { id: emailId },
        data: {
          summaryCn: ai!.summary,
          bodyZh: bodyZhFull,
          priority: priorityFrom(ai!.priority),
          tagsJson: JSON.stringify(ai!.tags ?? []),
        },
      });
      for (const line of ai!.action_items ?? []) {
        const t = line.trim();
        if (!t) continue;
        await tx.actionItem.create({
          data: {
            emailId,
            supplierId: email.supplierId,
            content: t,
            priority: priorityFrom(ai!.priority),
          },
        });
      }
    });
  } catch (e) {
    console.error("[applyAiSummaryToEmail] 入库失败", emailId, e);
    return "failed";
  }
  return "success";
}
