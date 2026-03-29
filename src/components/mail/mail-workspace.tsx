"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  PenSquare,
  RefreshCw,
  Send,
  Forward,
  Settings,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { MailDetail as MailDetailType } from "@/lib/mail/fixtures";
import type { MailSyncStreamEvent } from "@/lib/mail/sync-stream-types";
import type { MailThreadSummary } from "@/lib/mail/threading";
import { replySubject } from "@/lib/mail/compose-quote";
import {
  MailContext,
  filesToAttachments,
  type SupplierRow,
} from "./mail-context";
import { MailSidebar } from "./mail-sidebar";
import { MailList } from "./mail-list";
import { MailDetail } from "./mail-detail";
import { MailAnalysisPanel } from "./mail-analysis-panel";
import { EmailTagInput } from "./email-tag-input";

const SYNC_STEPS = ["连接中", "拉取邮件", "AI 分析中", "完成"] as const;

function CcBccToggle({
  cc, setCc, bcc, setBcc,
}: {
  cc: string[];
  setCc: React.Dispatch<React.SetStateAction<string[]>>;
  bcc: string[];
  setBcc: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const [showCc, setShowCc] = useState(cc.length > 0);
  const [showBcc, setShowBcc] = useState(bcc.length > 0);

  return (
    <>
      <div className="flex gap-3 text-[11px]">
        {!showCc && (
          <button
            type="button"
            className="text-indigo-600 hover:underline"
            onClick={() => setShowCc(true)}
          >
            + 添加抄送 (CC)
          </button>
        )}
        {!showBcc && (
          <button
            type="button"
            className="text-indigo-600 hover:underline"
            onClick={() => setShowBcc(true)}
          >
            + 添加密送 (BCC)
          </button>
        )}
      </div>
      {showCc && (
        <div>
          <Label className="text-xs">抄送 (CC)</Label>
          <EmailTagInput value={cc} onChange={setCc} placeholder="输入邮箱后回车添加" />
        </div>
      )}
      {showBcc && (
        <div>
          <Label className="text-xs">密送 (BCC)</Label>
          <EmailTagInput value={bcc} onChange={setBcc} placeholder="输入邮箱后回车添加" />
        </div>
      )}
    </>
  );
}

function AccountSelector({
  accounts,
  value,
  onChange,
}: {
  accounts: { id: string; email: string; displayName: string | null }[];
  value: string;
  onChange: (v: string) => void;
}) {
  if (accounts.length <= 1) {
    const acct = accounts[0];
    if (!acct) return null;
    return (
      <p className="text-[11px] text-slate-500">
        发件邮箱: <span className="font-mono">{acct.email}</span>
      </p>
    );
  }
  return (
    <div>
      <Label className="text-xs">发件邮箱</Label>
      <select
        className="mt-1 flex h-8 w-full rounded-lg border border-input bg-white px-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.displayName ? `${a.displayName} <${a.email}>` : a.email}
          </option>
        ))}
      </select>
    </div>
  );
}

export function MailWorkspace() {
  const searchParams = useSearchParams();
  const urlSupplierId = searchParams.get("supplierId");

  const [narrow, setNarrow] = useState(false);
  const [leftTab, setLeftTab] = useState<"all" | "suppliers">("suppliers");
  const [bucket, setBucket] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [qLeft, setQLeft] = useState("");
  const [qMid, setQMid] = useState("");
  const [threads, setThreads] = useState<MailThreadSummary[]>([]);
  const [emailId, setEmailId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<MailDetailType[]>([]);
  const [detail, setDetail] = useState<MailDetailType | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [expandedMsgIds, setExpandedMsgIds] = useState<Set<string>>(new Set());
  const [bodyEnOpenById, setBodyEnOpenById] = useState<Record<string, boolean>>({});
  const [replyEditorOpen, setReplyEditorOpen] = useState(false);
  const [replyZh, setReplyZh] = useState("");
  const [replyEnPreview, setReplyEnPreview] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardTo, setForwardTo] = useState("");
  const [forwardNote, setForwardNote] = useState("");
  const [forwardBusy, setForwardBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [mailActionBusy, setMailActionBusy] = useState(false);
  const [mobileStep, setMobileStep] = useState<0 | 1 | 2>(0);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTab, setAiTab] = useState("translate");
  const [aiTranslateIn, setAiTranslateIn] = useState("");
  const [aiTranslateOut, setAiTranslateOut] = useState("");
  const [aiDecisionOut, setAiDecisionOut] = useState("");
  const [asinQ, setAsinQ] = useState("");
  const [freeQ, setFreeQ] = useState("");
  const [classifyOpen, setClassifyOpen] = useState(false);
  const [classifySupplierId, setClassifySupplierId] = useState("");
  const [classifyDomain, setClassifyDomain] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [allSuppliers, setAllSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [syncStep, setSyncStep] = useState(-1);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncSubtext, setSyncSubtext] = useState<string | null>(null);
  const [syncDoneLabel, setSyncDoneLabel] = useState<string | null>(null);
  const [syncErrText, setSyncErrText] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [regenTargetId, setRegenTargetId] = useState<string | null>(null);
  const [batchSumBusy, setBatchSumBusy] = useState(false);

  // Reply/Forward recipients
  const [replyTo, setReplyTo] = useState<string[]>([]);
  const [replyCc, setReplyCc] = useState<string[]>([]);
  const [replyBcc, setReplyBcc] = useState<string[]>([]);
  const [forwardToList, setForwardToList] = useState<string[]>([]);
  const [forwardCc, setForwardCc] = useState<string[]>([]);
  const [forwardBcc, setForwardBcc] = useState<string[]>([]);

  // Compose (new email)
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState<string[]>([]);
  const [composeCc, setComposeCc] = useState<string[]>([]);
  const [composeBcc, setComposeBcc] = useState<string[]>([]);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBodyZh, setComposeBodyZh] = useState("");
  const [composeBodyEn, setComposeBodyEn] = useState("");
  const [composeFiles, setComposeFiles] = useState<File[]>([]);
  const [composeBusy, setComposeBusy] = useState(false);
  const [composeSendStep, setComposeSendStep] = useState<"edit" | "preview">("edit");
  const composeFileInputRef = useRef<HTMLInputElement>(null);

  // Email accounts
  const [accounts, setAccounts] = useState<{ id: string; email: string; displayName: string | null }[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const fn = () => setNarrow(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  useEffect(() => {
    if (urlSupplierId) {
      setSupplierId(urlSupplierId);
      setLeftTab("suppliers");
      if (narrow) setMobileStep(1);
    }
  }, [urlSupplierId, narrow]);

  const loadSuppliers = useCallback(async () => {
    const r = await fetch("/api/mail/suppliers");
    if (!r.ok) return;
    const j = (await r.json()) as SupplierRow[];
    setSuppliers(j);
  }, []);

  // Load email accounts
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/mail/accounts");
        if (r.ok) {
          const list = (await r.json()) as { id: string; email: string; displayName: string | null }[];
          setAccounts(list);
          if (list.length > 0 && !selectedAccountId) {
            setSelectedAccountId(list[0].id);
          }
        }
      } catch {
        // silent
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);

  const listQuerySuffix = useMemo(() => {
    const parts: string[] = [];
    if (leftTab === "all") {
      parts.push("uncategorized=1");
      if (bucket) parts.push(`bucket=${encodeURIComponent(bucket)}`);
    } else if (supplierId) {
      parts.push(`supplierId=${encodeURIComponent(supplierId)}`);
    }
    if (qMid.trim()) parts.push(`q=${encodeURIComponent(qMid.trim())}`);
    return parts.join("&");
  }, [leftTab, bucket, supplierId, qMid]);

  const loadEmails = useCallback(async () => {
    setLoadingList(true);
    try {
      if (leftTab === "suppliers" && !supplierId) {
        setThreads([]);
        return;
      }
      const url = `/api/mail/emails?${listQuerySuffix}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error("加载邮件列表失败");
      const j = (await r.json()) as { threads?: MailThreadSummary[] };
      setThreads(j.threads ?? []);
    } catch (e) {
      console.warn("[mail] loadEmails failed:", e);
      setThreads([]);
    } finally {
      setLoadingList(false);
    }
  }, [leftTab, supplierId, listQuerySuffix]);

  useEffect(() => {
    void loadEmails();
  }, [loadEmails]);

  const loadThread = useCallback(
    async (threadRootId: string) => {
      setLoadingDetail(true);
      try {
        const r = await fetch(
          `/api/mail/threads/${encodeURIComponent(threadRootId)}?${listQuerySuffix}`
        );
        if (!r.ok) throw new Error("加载对话失败");
        const j = (await r.json()) as { emails: MailDetailType[] };
        const list = j.emails ?? [];
        setThreadMessages(list);
        const latest = list[list.length - 1] ?? null;
        setDetail(latest);
        if (latest) {
          setExpandedMsgIds(new Set([latest.id]));
          for (const m of list) {
            if (!m.isRead) {
              await fetch(`/api/mail/emails/${m.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isRead: true }),
              });
            }
          }
          setThreadMessages((prev) => prev.map((m) => ({ ...m, isRead: true })));
          setDetail((d) => (d ? { ...d, isRead: true } : d));
        }
      } catch (e) {
        console.warn("[mail] loadThread failed:", e);
        setThreadMessages([]);
        setDetail(null);
      } finally {
        setLoadingDetail(false);
      }
    },
    [listQuerySuffix]
  );

  useEffect(() => {
    if (!emailId) {
      setThreadMessages([]);
      setDetail(null);
      setReplyEditorOpen(false);
      setExpandedMsgIds(new Set());
      setBodyEnOpenById({});
      return;
    }
    void loadThread(emailId);
    setReplyEditorOpen(false);
    setReplyZh("");
    setReplyFiles([]);
    setReplyCc([]);
    setReplyBcc([]);
  }, [emailId, loadThread]);

  // Auto-set replyTo when detail changes
  useEffect(() => {
    if (!detail) return;
    const addr =
      detail.direction === "RECEIVED" ? detail.fromAddress : detail.toAddress;
    setReplyTo(addr ? [addr] : []);
  }, [detail]);

  const filteredSuppliers = useMemo(() => {
    const q = qLeft.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.lastSnippet.toLowerCase().includes(q)
    );
  }, [suppliers, qLeft]);

  async function syncMail() {
    setSyncBusy(true);
    setSyncErrText(null);
    setSyncStep(0);
    setSyncSubtext("连接中…");
    setSyncDoneLabel(null);
    let hadStreamError = false;
    let lastDoneToast: string | null = null;

    const applySyncPayload = (p: MailSyncStreamEvent) => {
      if (p.phase === "connect") {
        setSyncStep(0);
        setSyncSubtext(p.message || "连接中…");
      } else if (p.phase === "fetch") {
        setSyncStep(1);
        if (p.current != null && p.total != null) {
          setSyncSubtext(`拉取中 ${p.current}/${p.total}`);
        } else {
          setSyncSubtext(p.message);
        }
      } else if (p.phase === "ai") {
        setSyncStep(2);
        setSyncSubtext(`AI 分析 ${p.current}/${p.total}`);
      } else if (p.phase === "done") {
        const doneMsg = p.message ?? `完成（共 ${p.imported} 封）`;
        setSyncStep(3);
        setSyncDoneLabel(doneMsg);
        lastDoneToast = doneMsg;
        setSyncSubtext(p.note ?? null);
      } else if (p.phase === "error") {
        const body = p.stack ? `${p.message}\n\n${p.stack}` : p.message;
        setSyncErrText(body);
        setSyncSubtext(null);
      }
    };

    try {
      const r = await fetch("/api/mail/sync", {
        method: "POST",
        headers: { Accept: "application/x-ndjson" },
      });

      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as {
          message?: string;
          stack?: string;
        };
        const msg = j.message ?? `HTTP ${r.status}`;
        setSyncErrText(j.stack ? `${msg}\n\n${j.stack}` : msg);
        setSyncStep(-1);
        setSyncSubtext(null);
        toast.error(msg);
        return;
      }

      const reader = r.body?.getReader();
      if (!reader) {
        setSyncErrText("响应无正文流，无法读取同步进度");
        setSyncStep(-1);
        return;
      }

      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let p: MailSyncStreamEvent;
          try {
            p = JSON.parse(line) as MailSyncStreamEvent;
          } catch {
            continue;
          }
          applySyncPayload(p);
          if (p.phase === "error") hadStreamError = true;
        }
      }
      if (buf.trim()) {
        try {
          const p = JSON.parse(buf) as MailSyncStreamEvent;
          applySyncPayload(p);
          if (p.phase === "error") hadStreamError = true;
        } catch {
          /* ignore trailing garbage */
        }
      }

      if (!hadStreamError) {
        toast.success(lastDoneToast ?? "同步完成");
        setLastSyncTime(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
        void loadSuppliers();
        void loadEmails();
        window.dispatchEvent(new Event("xitong-mail-stats-refresh"));
      } else {
        toast.error("同步失败，请查看下方错误信息");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? e.stack : undefined;
      setSyncErrText(stack ? `${msg}\n\n${stack}` : msg);
      setSyncStep(-1);
      setSyncSubtext(null);
      toast.error(msg);
    } finally {
      setSyncBusy(false);
    }
  }

  async function polishReplyAndOpenPreview() {
    if (!detail) return;
    setPreviewBusy(true);
    try {
      const r = await fetch("/api/mail/reply-polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bodyZh: replyZh }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error((j as { message?: string }).message ?? "AI 优化失败");
        return;
      }
      setReplyEnPreview((j as { bodyEn?: string }).bodyEn ?? "");
      setSendOpen(true);
    } finally {
      setPreviewBusy(false);
    }
  }

  async function confirmSend() {
    if (!detail) return;
    if (replyTo.length === 0) {
      toast.error("请填写收件人");
      return;
    }
    setSendBusy(true);
    try {
      let attachments: Awaited<ReturnType<typeof filesToAttachments>> = [];
      if (replyFiles.length) {
        attachments = await filesToAttachments(replyFiles);
      }
      const r = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: "send",
          to: replyTo.join(", "),
          cc: replyCc.length ? replyCc.join(", ") : undefined,
          bcc: replyBcc.length ? replyBcc.join(", ") : undefined,
          subject: replySubject(detail.subject),
          bodyEn: replyEnPreview,
          bodyZh: replyZh.trim() || undefined,
          replyToEmailId: detail.id,
          supplierId: detail.supplierId ?? undefined,
          attachments: attachments.length ? attachments : undefined,
          accountId: selectedAccountId || undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error((j as { message?: string }).message ?? "发送失败");
        return;
      }
      toast.success("已发送");
      setSendOpen(false);
      setReplyEditorOpen(false);
      setReplyZh("");
      setReplyFiles([]);
      setReplyCc([]);
      setReplyBcc([]);
      void loadEmails();
      if (emailId) void loadThread(emailId);
      window.dispatchEvent(new Event("xitong-mail-stats-refresh"));
    } finally {
      setSendBusy(false);
    }
  }

  async function submitForward() {
    if (!detail || (forwardToList.length === 0 && !forwardTo.trim())) {
      toast.error("请填写收件人邮箱");
      return;
    }
    setForwardBusy(true);
    try {
      const to = forwardToList.length > 0 ? forwardToList.join(", ") : forwardTo.trim();
      const r = await fetch("/api/mail/forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailId: detail.id,
          to,
          cc: forwardCc.length ? forwardCc.join(", ") : undefined,
          bcc: forwardBcc.length ? forwardBcc.join(", ") : undefined,
          noteZh: forwardNote.trim() || undefined,
          accountId: selectedAccountId || undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error((j as { message?: string }).message ?? "转发失败");
        return;
      }
      toast.success("已转发");
      setForwardOpen(false);
      setForwardTo("");
      setForwardToList([]);
      setForwardCc([]);
      setForwardBcc([]);
      setForwardNote("");
      void loadEmails();
      window.dispatchEvent(new Event("xitong-mail-stats-refresh"));
    } finally {
      setForwardBusy(false);
    }
  }

  // Compose new email
  async function composeTranslateAndPreview() {
    if (!composeBodyZh.trim()) return;
    setComposeBusy(true);
    try {
      const r = await fetch("/api/mail/reply-polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bodyZh: composeBodyZh }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error((j as { message?: string }).message ?? "AI 翻译失败");
        return;
      }
      setComposeBodyEn((j as { bodyEn?: string }).bodyEn ?? "");
      setComposeSendStep("preview");
    } finally {
      setComposeBusy(false);
    }
  }

  async function composeConfirmSend() {
    if (composeTo.length === 0) {
      toast.error("请填写收件人");
      return;
    }
    if (!composeSubject.trim()) {
      toast.error("请填写主题");
      return;
    }
    setComposeBusy(true);
    try {
      let attachments: Awaited<ReturnType<typeof filesToAttachments>> = [];
      if (composeFiles.length) {
        attachments = await filesToAttachments(composeFiles);
      }
      const r = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: "send",
          to: composeTo.join(", "),
          cc: composeCc.length ? composeCc.join(", ") : undefined,
          bcc: composeBcc.length ? composeBcc.join(", ") : undefined,
          subject: composeSubject.trim(),
          bodyEn: composeBodyEn,
          bodyZh: composeBodyZh.trim() || undefined,
          attachments: attachments.length ? attachments : undefined,
          accountId: selectedAccountId || undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error((j as { message?: string }).message ?? "发送失败");
        return;
      }
      toast.success("已发送");
      setComposeOpen(false);
      setComposeTo([]);
      setComposeCc([]);
      setComposeBcc([]);
      setComposeSubject("");
      setComposeBodyZh("");
      setComposeBodyEn("");
      setComposeFiles([]);
      setComposeSendStep("edit");
      void loadEmails();
      window.dispatchEvent(new Event("xitong-mail-stats-refresh"));
    } finally {
      setComposeBusy(false);
    }
  }

  async function confirmSoftDelete() {
    if (!detail) return;
    setDeleteBusy(true);
    try {
      const r = await fetch(`/api/mail/emails/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDeleted: true }),
      });
      if (!r.ok) {
        toast.error("删除失败");
        return;
      }
      toast.success("已移入已删除");
      setDeleteOpen(false);
      setEmailId(null);
      setDetail(null);
      setThreadMessages([]);
      void loadEmails();
      void loadSuppliers();
      window.dispatchEvent(new Event("xitong-mail-stats-refresh"));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function patchDetailFlags(
    data: Partial<{ isRead: boolean; isStarred: boolean; isArchived: boolean }>
  ) {
    if (!detail) return;
    setMailActionBusy(true);
    try {
      const r = await fetch(`/api/mail/emails/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) {
        toast.error("更新失败");
        return;
      }
      if (emailId) void loadThread(emailId);
      void loadEmails();
    } finally {
      setMailActionBusy(false);
    }
  }

  async function toggleTodo(todoId: string, done: boolean) {
    const r = await fetch(`/api/todos/${todoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCompleted: done }),
    });
    if (!r.ok) {
      toast.error("更新待办失败");
      return;
    }
    if (emailId) void loadThread(emailId);
  }

  async function openClassify() {
    const r = await fetch("/api/suppliers");
    if (r.ok) {
      const j = (await r.json()) as { items?: { id: string; name: string }[] };
      setAllSuppliers((j.items ?? []).map((x) => ({ id: x.id, name: x.name })));
    }
    setClassifyOpen(true);
  }

  async function submitClassify() {
    if (!detail || !classifySupplierId) {
      toast.error("请选择供应商");
      return;
    }
    const r = await fetch(`/api/mail/emails/${detail.id}/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId: classifySupplierId,
        applyDomain: classifyDomain,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast.error((j as { message?: string }).message ?? "归类失败");
      return;
    }
    toast.success((j as { message?: string }).message ?? "已归类");
    setClassifyOpen(false);
    // Clear current selection — the classified email no longer belongs in current view
    setEmailId(null);
    setDetail(null);
    setThreadMessages([]);
    void loadEmails();
    void loadSuppliers();
    window.dispatchEvent(new Event("xitong-mail-stats-refresh"));
  }

  async function regenerateSummaryFor(targetEmailId: string) {
    setRegenTargetId(targetEmailId);
    try {
      const r = await fetch("/api/mail/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId: targetEmailId, force: true }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error((j as { message?: string }).message ?? "生成失败");
        return;
      }
      toast.success("摘要已更新");
      if (emailId) void loadThread(emailId);
    } finally {
      setRegenTargetId(null);
    }
  }

  async function batchRegenerateSummaries() {
    setBatchSumBusy(true);
    try {
      const r = await fetch("/api/mail/batch-summarize", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error((j as { message?: string }).message ?? "批量失败");
        return;
      }
      toast.success((j as { note?: string }).note ?? "批量完成");
      void loadEmails();
      if (emailId) void loadThread(emailId);
    } finally {
      setBatchSumBusy(false);
    }
  }

  async function runAiTranslate() {
    const r = await fetch("/api/mail/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: aiTranslateIn }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast.error((j as { message?: string }).message ?? "失败");
      return;
    }
    setAiTranslateOut((j as { text?: string }).text ?? "");
  }

  async function runAiDecision() {
    if (!detail) return;
    const r = await fetch("/api/mail/ai-decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: `${detail.subject}\n${detail.bodyText}\n${detail.summaryCn ?? ""}`,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast.error((j as { message?: string }).message ?? "失败");
      return;
    }
    setAiDecisionOut((j as { text?: string }).text ?? "");
  }

  // Build context value
  const ctxValue = useMemo(
    () => ({
      leftTab, setLeftTab, bucket, setBucket, supplierId, setSupplierId,
      suppliers, qLeft, setQLeft, filteredSuppliers,
      threads, emailId, setEmailId, qMid, setQMid, loadingList,
      detail, threadMessages, loadingDetail, expandedMsgIds, setExpandedMsgIds,
      bodyEnOpenById, setBodyEnOpenById, mailActionBusy,
      patchDetailFlags, toggleTodo, regenerateSummaryFor, regenTargetId, openClassify,
      replyEditorOpen, setReplyEditorOpen, replyZh, setReplyZh,
      replyFiles, setReplyFiles, replyFileInputRef, polishReplyAndOpenPreview, previewBusy,
      replyTo, setReplyTo, replyCc, setReplyCc, replyBcc, setReplyBcc,
      forwardOpen, setForwardOpen, forwardTo, setForwardTo, forwardNote, setForwardNote,
      forwardBusy, submitForward, forwardToList, setForwardToList, forwardCc, setForwardCc, forwardBcc, setForwardBcc,
      deleteOpen, setDeleteOpen, deleteBusy, confirmSoftDelete,
      sendOpen, setSendOpen, replyEnPreview, setReplyEnPreview, sendBusy, confirmSend,
      composeOpen, setComposeOpen, composeTo, setComposeTo, composeCc, setComposeCc,
      composeBcc, setComposeBcc, composeSubject, setComposeSubject,
      composeBodyZh, setComposeBodyZh, composeBodyEn, setComposeBodyEn,
      composeFiles, setComposeFiles, composeBusy, composeSendStep, setComposeSendStep,
      composeTranslateAndPreview, composeConfirmSend,
      accounts, selectedAccountId, setSelectedAccountId,
      classifyOpen, setClassifyOpen, classifySupplierId, setClassifySupplierId,
      classifyDomain, setClassifyDomain, supplierSearch, setSupplierSearch,
      allSuppliers, submitClassify,
      aiOpen, setAiOpen, aiTab, setAiTab, aiTranslateIn, setAiTranslateIn,
      aiTranslateOut, setAiTranslateOut, aiDecisionOut, runAiTranslate, runAiDecision,
      asinQ, setAsinQ, freeQ, setFreeQ,
      syncBusy, syncMail, syncStep, syncSubtext, syncDoneLabel, syncErrText, lastSyncTime,
      batchSumBusy, batchRegenerateSummaries,
      narrow, mobileStep, setMobileStep,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      leftTab, bucket, supplierId, suppliers, qLeft, filteredSuppliers,
      threads, emailId, qMid, loadingList, detail, threadMessages, loadingDetail,
      expandedMsgIds, bodyEnOpenById, mailActionBusy, regenTargetId,
      replyEditorOpen, replyZh, replyFiles, previewBusy,
      replyTo, replyCc, replyBcc,
      forwardOpen, forwardTo, forwardNote, forwardBusy, forwardToList, forwardCc, forwardBcc,
      deleteOpen, deleteBusy, sendOpen, replyEnPreview, sendBusy,
      composeOpen, composeTo, composeCc, composeBcc, composeSubject,
      composeBodyZh, composeBodyEn, composeFiles, composeBusy, composeSendStep,
      accounts, selectedAccountId,
      classifyOpen, classifySupplierId, classifyDomain, supplierSearch, allSuppliers,
      aiOpen, aiTab, aiTranslateIn, aiTranslateOut, aiDecisionOut, asinQ, freeQ,
      syncBusy, syncStep, syncSubtext, syncDoneLabel, syncErrText, lastSyncTime,
      batchSumBusy, narrow, mobileStep,
    ]
  );

  const desktopLayout = (
    <div className="flex h-[calc(100dvh-8rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="h-full w-[250px] shrink-0 overflow-hidden border-r border-slate-200">
        <MailSidebar />
      </div>
      <div className="h-full w-[350px] shrink-0 overflow-hidden border-r border-slate-200">
        <MailList />
      </div>
      <div className="h-full min-w-0 flex-1 overflow-hidden">
        <MailDetail />
      </div>
    </div>
  );

  const mobileFlow = (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      {mobileStep > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="m-2 w-fit gap-1"
          onClick={() => setMobileStep((s) => (s === 2 ? 1 : 0) as 0 | 1 | 2)}
        >
          <ArrowLeft className="size-4" />
          返回
        </Button>
      )}
      {mobileStep === 0 && <MailSidebar />}
      {mobileStep === 1 && <MailList />}
      {mobileStep === 2 && <MailDetail />}
    </div>
  );

  return (
    <MailContext.Provider value={ctxValue}>
      <div className="mx-auto max-w-[1600px] space-y-3">
        {/* Top toolbar */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-heading text-2xl font-semibold text-slate-900">
              邮件中心
            </h1>
            <p className="text-xs text-slate-500">
              英文沟通 · 中文阅读 · 发送前自动翻译
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setComposeTo([]);
                setComposeCc([]);
                setComposeBcc([]);
                setComposeSubject("");
                setComposeBodyZh("");
                setComposeBodyEn("");
                setComposeFiles([]);
                setComposeSendStep("edit");
                setComposeOpen(true);
              }}
            >
              <PenSquare className="size-3.5" />
              写邮件
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={syncBusy}
              onClick={() => void syncMail()}
            >
              {syncBusy ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 size-3.5" />
              )}
              同步邮件
            </Button>
            {lastSyncTime && (
              <span className="text-[10px] text-slate-400">
                上次同步 {lastSyncTime}
              </span>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={batchSumBusy || syncBusy}
              onClick={() => void batchRegenerateSummaries()}
            >
              {batchSumBusy ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1 size-3.5" />
              )}
              批量生成摘要
            </Button>
            <Link href="/dashboard/mail/accounts">
              <Button type="button" variant="ghost" size="sm">
                <Settings className="mr-1 size-3.5" />
                邮箱设置
              </Button>
            </Link>
          </div>
        </div>

        {/* Sync error */}
        {syncErrText && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-950">
            <p className="text-sm font-medium">同步失败（完整错误便于调试）</p>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
              {syncErrText}
            </pre>
          </div>
        )}

        {/* Sync progress */}
        {syncStep >= 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-700">
              {SYNC_STEPS.map((base, i) => {
                const label = i === 3 ? (syncDoneLabel ?? "完成") : base;
                const past = syncStep > i;
                const current = syncStep === i;
                return (
                  <span key={`${base}-${i}`} className="inline-flex items-center gap-2">
                    {i > 0 && (
                      <span className="select-none text-slate-300" aria-hidden>
                        →
                      </span>
                    )}
                    <span
                      className={cn(
                        past && "text-emerald-800",
                        current && "font-semibold text-indigo-800",
                        !past && !current && "text-slate-400"
                      )}
                    >
                      {past ? "✓ " : ""}
                      {label}
                    </span>
                  </span>
                );
              })}
            </div>
            {syncSubtext && (
              <p className="mt-1.5 text-[11px] text-slate-600">{syncSubtext}</p>
            )}
          </div>
        )}

        {/* Main content */}
        {narrow ? mobileFlow : desktopLayout}

        {/* Dialogs */}
        {/* Reply send preview */}
        <Dialog open={sendOpen} onOpenChange={setSendOpen}>
          <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>确认发送</DialogTitle>
              <DialogDescription>
                左侧为您的中文大意，右侧为可编辑的英文正文，确认后通过 SMTP 发出。
              </DialogDescription>
            </DialogHeader>

            {/* Recipients */}
            <div className="space-y-2">
              <div>
                <Label className="text-xs">收件人</Label>
                <EmailTagInput value={replyTo} onChange={setReplyTo} placeholder="输入邮箱后回车添加" />
              </div>
              <CcBccToggle
                cc={replyCc} setCc={setReplyCc}
                bcc={replyBcc} setBcc={setReplyBcc}
              />
              <AccountSelector
                accounts={accounts}
                value={selectedAccountId}
                onChange={setSelectedAccountId}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="min-h-0">
                <p className="text-xs font-medium text-slate-600">中文大意</p>
                <div className="mt-1 max-h-[min(50vh,320px)] overflow-y-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">
                  {replyZh.trim() || "（未填写）"}
                </div>
              </div>
              <div className="min-h-0">
                <p className="text-xs font-medium text-slate-600">英文正文（可编辑）</p>
                <textarea
                  className="mt-1 max-h-[min(50vh,320px)] min-h-[200px] w-full rounded-md border border-input p-3 text-sm leading-relaxed"
                  value={replyEnPreview}
                  onChange={(e) => setReplyEnPreview(e.target.value)}
                  spellCheck={false}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSendOpen(false)}>
                取消
              </Button>
              <Button
                type="button"
                className="gap-1.5"
                onClick={() => void confirmSend()}
                disabled={sendBusy || !replyEnPreview.trim() || replyTo.length === 0}
              >
                {sendBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                确认发送
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Forward */}
        <Dialog open={forwardOpen} onOpenChange={setForwardOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>转发邮件</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">收件人</Label>
                <EmailTagInput
                  value={forwardToList}
                  onChange={setForwardToList}
                  placeholder="输入邮箱后回车添加"
                />
              </div>
              <CcBccToggle
                cc={forwardCc} setCc={setForwardCc}
                bcc={forwardBcc} setBcc={setForwardBcc}
              />
              {detail && (
                <p className="text-[11px] text-slate-500">
                  原始发件人: <span className="font-mono">{detail.fromAddress}</span>
                </p>
              )}
              <AccountSelector
                accounts={accounts}
                value={selectedAccountId}
                onChange={setSelectedAccountId}
              />
              <div>
                <Label className="text-xs">转发备注（中文，可选）</Label>
                <textarea
                  className="mt-1 min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="附言…"
                  value={forwardNote}
                  onChange={(e) => setForwardNote(e.target.value)}
                />
              </div>
              <p className="text-[11px] text-slate-500">
                将附带原信正文及服务器上已有的附件文件。
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setForwardOpen(false)}>
                取消
              </Button>
              <Button
                type="button"
                onClick={() => void submitForward()}
                disabled={forwardBusy || forwardToList.length === 0}
              >
                {forwardBusy ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : (
                  <Forward className="mr-1 size-4" />
                )}
                发送转发
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Compose new email */}
        <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
          <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>写邮件</DialogTitle>
            </DialogHeader>

            {composeSendStep === "edit" ? (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">收件人</Label>
                  <EmailTagInput value={composeTo} onChange={setComposeTo} placeholder="输入邮箱后回车添加" />
                </div>
                <CcBccToggle
                  cc={composeCc} setCc={setComposeCc}
                  bcc={composeBcc} setBcc={setComposeBcc}
                />
                <AccountSelector
                  accounts={accounts}
                  value={selectedAccountId}
                  onChange={setSelectedAccountId}
                />
                <div>
                  <Label className="text-xs">主题</Label>
                  <Input
                    className="mt-1"
                    placeholder="邮件主题"
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">正文（中文，将自动翻译为英文）</Label>
                  <textarea
                    className="mt-1 min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed"
                    placeholder="用中文写邮件内容…"
                    value={composeBodyZh}
                    onChange={(e) => setComposeBodyZh(e.target.value)}
                  />
                </div>
                {/* File attachments */}
                <input
                  ref={composeFileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(ev) => {
                    const list = ev.target.files;
                    if (!list?.length) return;
                    setComposeFiles((prev) => [...prev, ...Array.from(list)]);
                    ev.target.value = "";
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => composeFileInputRef.current?.click()}
                  >
                    添加附件
                  </Button>
                  {composeFiles.map((f, i) => (
                    <span
                      key={`${f.name}-${i}`}
                      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px]"
                    >
                      {f.name}
                      <button
                        type="button"
                        className="text-red-500"
                        onClick={() => setComposeFiles((p) => p.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              /* Preview step */
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="min-h-0">
                  <p className="text-xs font-medium text-slate-600">中文原文</p>
                  <div className="mt-1 max-h-[min(50vh,320px)] overflow-y-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">
                    {composeBodyZh.trim() || "（未填写）"}
                  </div>
                </div>
                <div className="min-h-0">
                  <p className="text-xs font-medium text-slate-600">英文正文（可编辑）</p>
                  <textarea
                    className="mt-1 max-h-[min(50vh,320px)] min-h-[200px] w-full rounded-md border border-input p-3 text-sm leading-relaxed"
                    value={composeBodyEn}
                    onChange={(e) => setComposeBodyEn(e.target.value)}
                    spellCheck={false}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              {composeSendStep === "edit" ? (
                <>
                  <Button type="button" variant="outline" onClick={() => setComposeOpen(false)}>
                    取消
                  </Button>
                  <Button
                    type="button"
                    className="gap-1.5"
                    onClick={() => void composeTranslateAndPreview()}
                    disabled={composeBusy || !composeBodyZh.trim() || composeTo.length === 0}
                  >
                    {composeBusy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    AI翻译并预览
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={() => setComposeSendStep("edit")}>
                    返回编辑
                  </Button>
                  <Button
                    type="button"
                    className="gap-1.5"
                    onClick={() => void composeConfirmSend()}
                    disabled={composeBusy || !composeBodyEn.trim()}
                  >
                    {composeBusy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    确认发送
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>确定删除？</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600">
              邮件将标记为已删除，不在列表中显示（软删除）。
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
                取消
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void confirmSoftDelete()}
                disabled={deleteBusy}
              >
                {deleteBusy ? <Loader2 className="size-4 animate-spin" /> : "删除"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={classifyOpen} onOpenChange={setClassifyOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>归入供应商</DialogTitle>
            </DialogHeader>
            <Input
              placeholder="搜索供应商…"
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
              className="mb-2"
            />
            <div className="max-h-48 overflow-y-auto rounded-md border">
              {allSuppliers
                .filter((s) =>
                  s.name.toLowerCase().includes(supplierSearch.trim().toLowerCase())
                )
                .map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={cn(
                      "block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50",
                      classifySupplierId === s.id && "bg-indigo-50"
                    )}
                    onClick={() => setClassifySupplierId(s.id)}
                  >
                    {s.name}
                  </button>
                ))}
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={classifyDomain}
                onChange={(e) => setClassifyDomain(e.target.checked)}
              />
              将同域名邮件一并归入
            </label>
            <DialogFooter>
              <Button type="button" onClick={() => void submitClassify()}>
                确认
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <MailAnalysisPanel />
      </div>
    </MailContext.Provider>
  );
}
