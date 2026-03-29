import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import prisma from "@/lib/prisma";
import { EmailDirection, MailPriority } from "@prisma/client";
import {
  extractDomainFromAddress,
  isPublicEmailDomain,
} from "@/lib/mail/public-domains";
import { decryptPassword } from "@/lib/mail/crypto";
import type { MailSyncStreamEvent } from "@/lib/mail/sync-stream-types";
import type { MailSummaryJson } from "@/lib/mail/claude-mail";

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

/** 同步单个邮箱账号 */
async function syncOneAccount(
  accountId: string,
  options: {
    onProgress?: (p: SyncProgressPayload) => void;
    sinceDays: number;
  },
): Promise<{
  imported: number;
  analyzed: number;
  aiSkipped?: number;
  aiFailed?: number;
  error?: string;
  errorStack?: string;
  note?: string;
}> {
  const emit = options.onProgress ?? (() => {});
  const sinceDays = options.sinceDays;

  const account = await prisma.emailAccount.findUnique({
    where: { id: accountId },
  });
  if (!account) {
    const msg = "邮箱账号不存在";
    emit({ phase: "error", message: msg });
    return { imported: 0, analyzed: 0, error: msg };
  }
  if (!account.isActive) {
    const msg = `邮箱 ${account.email} 已停用`;
    emit({ phase: "error", message: msg });
    return { imported: 0, analyzed: 0, error: msg };
  }

  let imapPass: string;
  try {
    imapPass = decryptPassword(account.imapPassword);
  } catch {
    const msg = `邮箱 ${account.email} 密码解密失败，请重新设置密码`;
    emit({ phase: "error", message: msg });
    return { imported: 0, analyzed: 0, error: msg };
  }

  const host = account.imapHost;
  const port = account.imapPort;
  const user = account.email;
  const secure = true;

  // 确保 syncState 存在
  await prisma.imapSyncState.upsert({
    where: { accountId },
    create: { accountId, lastUid: 0, status: "active" },
    update: {},
  });

  console.log("[IMAP] 准备连接:", { host, port, secure, user, accountId });

  const client = new ImapFlow({
    host,
    port,
    secure,
    auth: { user, pass: imapPass },
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  let imported = 0;
  let analyzed = 0;
  const newEmailIds: string[] = [];
  let imapError: string | null = null;
  let imapErrorStack: string | undefined;
  let inboxHadNoUids = false;

  try {
    emit({ phase: "connect", message: `连接 ${user}…` });
    await client.connect();
    console.log("[IMAP] 连接成功:", { host, port, secure, user });

    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - sinceDays * 86400000);
      emit({ phase: "fetch", message: `拉取 ${user} 邮件（最近 ${sinceDays} 天）…` });

      const raw = await client.search({ since });
      const uids = Array.isArray(raw) ? [...raw].sort((a, b) => a - b) : [];

      if (uids.length === 0) {
        await prisma.imapSyncState.update({
          where: { accountId },
          data: { lastSyncAt: new Date() },
        });
        await prisma.emailAccount.update({
          where: { id: accountId },
          data: { lastSyncAt: new Date() },
        });
        const note = `${user}: 最近 ${sinceDays} 天内无邮件`;
        emit({ phase: "done", imported: 0, analyzed: 0, note, message: "完成（共 0 封）" });
        inboxHadNoUids = true;
      } else {
        let fetchIdx = 0;
        for await (const msg of client.fetch(uids, { uid: true, source: true })) {
          fetchIdx += 1;
          emit({ phase: "fetch", message: `拉取 ${user} 邮件…`, current: fetchIdx, total: uids.length });

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

          const fromAddr = parsed.from?.value?.[0]?.address || parsed.from?.text || "unknown@unknown";
          const toAddr = parsed.to?.value?.[0]?.address || user;
          const supplierId = await resolveSupplierId(fromAddr);
          const bodyText = parsed.text || "";
          const bodyHtml = typeof parsed.html === "string" ? parsed.html : null;

          const refs = parsed.references;
          const referencesIds =
            refs == null ? null
            : typeof refs === "string" ? refs
            : Array.isArray(refs) ? refs.join(" ")
            : String(refs);

          const inReply =
            typeof parsed.inReplyTo === "string"
              ? parsed.inReplyTo.replace(/[<>]/g, "")
              : null;

          const row = await prisma.email.create({
            data: {
              accountId,
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
        const syncData: { lastSyncAt: Date; lastUid?: number } = { lastSyncAt: new Date() };
        if (maxUid > 0) {
          const st = await prisma.imapSyncState.findUnique({ where: { accountId } });
          syncData.lastUid = Math.max(st?.lastUid ?? 0, maxUid);
        }
        await prisma.imapSyncState.update({ where: { accountId }, data: syncData });
        await prisma.emailAccount.update({
          where: { id: accountId },
          data: { lastSyncAt: new Date() },
        });
      }
    } finally {
      lock?.release();
    }
  } catch (e) {
    logImapDiagnostics(`IMAP 同步异常（${user}）`, e);
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
    return { imported, analyzed, error: imapError, errorStack: imapErrorStack };
  }

  if (inboxHadNoUids) {
    return { imported: 0, analyzed: 0, note: `${user}: 最近 ${sinceDays} 天内无邮件` };
  }

  if (newEmailIds.length === 0) {
    const note = `${user}: 最近 ${sinceDays} 天内无新邮件（或均已入库）`;
    emit({ phase: "done", imported: 0, analyzed: 0, note, message: "完成（共 0 封）" });
    return { imported: 0, analyzed: 0, note };
  }

  // AI 分析
  const totalAi = newEmailIds.length;
  let aiSuccess = 0;
  let aiSkipped = 0;
  let aiFailed = 0;

  emit({ phase: "ai", message: "AI 分析中…", current: 0, total: totalAi });

  for (let i = 0; i < newEmailIds.length; i++) {
    const eid = newEmailIds[i]!;
    const r = await applyAiSummaryToEmail(eid);
    if (r === "success" || r === "already") aiSuccess += 1;
    else if (r === "skipped_empty" || r === "skipped_short") aiSkipped += 1;
    else if (r === "failed") aiFailed += 1;

    emit({ phase: "ai", message: "AI 分析中…", current: i + 1, total: totalAi });
  }

  analyzed = aiSuccess;
  const note = `${user}: 新入库 ${imported} 封；AI：成功 ${aiSuccess}，跳过 ${aiSkipped}，失败 ${aiFailed}`;
  emit({ phase: "done", imported, analyzed: aiSuccess, aiSkipped, aiFailed, note, message: `完成（共 ${imported} 封）` });

  return { imported, analyzed: aiSuccess, aiSkipped, aiFailed, note };
}

/**
 * 同步邮件：支持指定账号 ID 或同步当前用户全部活跃账号。
 */
export async function runImapSync(options?: {
  onProgress?: (p: SyncProgressPayload) => void;
  sinceDays?: number;
  /** 指定同步某个 EmailAccount ID */
  accountId?: string;
  /** 同步某个用户的全部活跃邮箱 */
  userId?: string;
}): Promise<{
  imported: number;
  analyzed: number;
  aiSkipped?: number;
  aiFailed?: number;
  error?: string;
  errorStack?: string;
  note?: string;
}> {
  const sinceDays =
    options?.sinceDays ?? Number(process.env.MAIL_SYNC_SINCE_DAYS?.trim() || "7");

  // 确定要同步的账号列表
  let accountIds: string[] = [];

  if (options?.accountId) {
    accountIds = [options.accountId];
  } else if (options?.userId) {
    const accounts = await prisma.emailAccount.findMany({
      where: { userId: options.userId, isActive: true },
      select: { id: true },
    });
    accountIds = accounts.map((a) => a.id);
  } else {
    // 没有指定 → 同步所有活跃邮箱
    const accounts = await prisma.emailAccount.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    accountIds = accounts.map((a) => a.id);
  }

  if (accountIds.length === 0) {
    const msg = "没有可同步的邮箱账号，请先在邮件设置中添加邮箱";
    options?.onProgress?.({ phase: "error", message: msg });
    return { imported: 0, analyzed: 0, error: msg };
  }

  let totalImported = 0;
  let totalAnalyzed = 0;
  let totalAiSkipped = 0;
  let totalAiFailed = 0;
  const notes: string[] = [];
  let lastError: string | undefined;
  let lastErrorStack: string | undefined;

  for (const aid of accountIds) {
    const r = await syncOneAccount(aid, {
      onProgress: options?.onProgress,
      sinceDays,
    });
    totalImported += r.imported;
    totalAnalyzed += r.analyzed ?? 0;
    totalAiSkipped += r.aiSkipped ?? 0;
    totalAiFailed += r.aiFailed ?? 0;
    if (r.note) notes.push(r.note);
    if (r.error) {
      lastError = r.error;
      lastErrorStack = r.errorStack;
    }
  }

  return {
    imported: totalImported,
    analyzed: totalAnalyzed,
    aiSkipped: totalAiSkipped,
    aiFailed: totalAiFailed,
    note: notes.join("; ") || undefined,
    error: lastError,
    errorStack: lastErrorStack,
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
