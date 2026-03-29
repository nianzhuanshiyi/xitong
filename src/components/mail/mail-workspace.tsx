"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Archive,
  Bot,
  Building2,
  Forward,
  Inbox,
  Loader2,
  MailOpen,
  Paperclip,
  RefreshCw,
  Reply,
  Send,
  Settings,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { MailDetail } from "@/lib/mail/fixtures";
import type { MailSyncStreamEvent } from "@/lib/mail/sync-stream-types";
import type { MailThreadSummary } from "@/lib/mail/threading";
import { replySubject } from "@/lib/mail/compose-quote";

const SYNC_STEPS = ["连接中", "拉取邮件", "AI 分析中", "完成"] as const;

type SupplierRow = {
  id: string;
  name: string;
  status: string;
  unreadCount: number;
  lastSnippet: string;
  lastAt: string;
};

const BUCKETS: { id: string; label: string }[] = [
  { id: "logistics", label: "物流通知" },
  { id: "invoice", label: "账单" },
  { id: "inquiry", label: "新供应商询盘" },
  { id: "fair", label: "展会邀请" },
  { id: "other", label: "其他" },
];

function formatMailTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  const diff = (now.getTime() - d.getTime()) / 86400_000;
  if (diff < 7) {
    const w = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
    return `周${w}`;
  }
  return d.toLocaleDateString("zh-CN");
}

function statusBarClass(status: string) {
  if (status === "COOPERATING") return "border-l-green-500";
  if (status === "EVALUATING") return "border-l-blue-500";
  return "border-l-slate-400";
}

async function filesToAttachments(files: File[]) {
  const out: { filename: string; contentType: string; contentBase64: string }[] =
    [];
  for (const f of files) {
    const b64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = r.result as string;
        const i = s.indexOf(",");
        resolve(i >= 0 ? s.slice(i + 1) : s);
      };
      r.onerror = () => reject(r.error);
      r.readAsDataURL(f);
    });
    out.push({
      filename: f.name,
      contentType: f.type || "application/octet-stream",
      contentBase64: b64,
    });
  }
  return out;
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
  const [threadMessages, setThreadMessages] = useState<MailDetail[]>([]);
  const [detail, setDetail] = useState<MailDetail | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [expandedMsgIds, setExpandedMsgIds] = useState<Set<string>>(new Set());
  const [bodyEnOpenById, setBodyEnOpenById] = useState<Record<string, boolean>>(
    {}
  );
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
  const [allSuppliers, setAllSuppliers] = useState<{ id: string; name: string }[]>(
    []
  );

  /** 0–3 对应 SYNC_STEPS；未开始同步时为 -1 */
  const [syncStep, setSyncStep] = useState(-1);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncSubtext, setSyncSubtext] = useState<string | null>(null);
  const [syncDoneLabel, setSyncDoneLabel] = useState<string | null>(null);
  const [syncErrText, setSyncErrText] = useState<string | null>(null);
  const [regenTargetId, setRegenTargetId] = useState<string | null>(null);
  const [batchSumBusy, setBatchSumBusy] = useState(false);

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
      toast.error(e instanceof Error ? e.message : "加载失败");
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
        const j = (await r.json()) as { emails: MailDetail[] };
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
          setThreadMessages((prev) =>
            prev.map((m) => ({ ...m, isRead: true }))
          );
          setDetail((d) => (d ? { ...d, isRead: true } : d));
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "加载失败");
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
  }, [emailId, loadThread]);

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
          to:
            detail.direction === "RECEIVED"
              ? detail.fromAddress
              : detail.toAddress,
          subject: replySubject(detail.subject),
          bodyEn: replyEnPreview,
          bodyZh: replyZh.trim() || undefined,
          replyToEmailId: detail.id,
          supplierId: detail.supplierId ?? undefined,
          attachments: attachments.length ? attachments : undefined,
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
      void loadEmails();
      if (emailId) void loadThread(emailId);
      window.dispatchEvent(new Event("xitong-mail-stats-refresh"));
    } finally {
      setSendBusy(false);
    }
  }

  async function submitForward() {
    if (!detail || !forwardTo.trim()) {
      toast.error("请填写收件人邮箱");
      return;
    }
    setForwardBusy(true);
    try {
      const r = await fetch("/api/mail/forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailId: detail.id,
          to: forwardTo.trim(),
          noteZh: forwardNote.trim() || undefined,
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
      setForwardNote("");
      void loadEmails();
      window.dispatchEvent(new Event("xitong-mail-stats-refresh"));
    } finally {
      setForwardBusy(false);
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
    data: Partial<{
      isRead: boolean;
      isStarred: boolean;
      isArchived: boolean;
    }>
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
      const j = (await r.json()) as {
        items?: { id: string; name: string }[];
      };
      setAllSuppliers(
        (j.items ?? []).map((x) => ({ id: x.id, name: x.name }))
      );
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
    void loadEmails();
    if (emailId) void loadThread(emailId);
    void loadSuppliers();
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

  function priLabelFor(m: MailDetail) {
    return m.priority === "URGENT"
      ? "🔴 紧急"
      : m.priority === "LOW"
        ? "🟢 低"
        : "🟡 一般";
  }

  function msgSnippetText(m: MailDetail) {
    if (m.summaryCn?.trim()) return m.summaryCn.trim();
    const t = m.bodyZh?.trim() || m.bodyText?.trim() || "";
    if (!t) return "（无内容）";
    return t.length > 100 ? `${t.slice(0, 100)}…` : t;
  }

  const col1 = (
    <div className="flex h-full min-h-0 w-[240px] shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-2">
        <Tabs
          value={leftTab}
          onValueChange={(v) => {
            setLeftTab(v as "all" | "suppliers");
            setBucket(null);
            if (v === "all") setSupplierId(null);
            setEmailId(null);
          }}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="all" className="gap-1 text-xs">
              <Inbox className="size-3.5" />
              全部
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="gap-1 text-xs">
              <Building2 className="size-3.5" />
              供应商
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <Input
        placeholder="搜索…"
        className="mx-2 mt-2 h-8 text-xs"
        value={qLeft}
        onChange={(e) => setQLeft(e.target.value)}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {leftTab === "all" ? (
          <div className="space-y-1">
            <p className="px-1 text-[10px] font-medium text-slate-500">AI 分类</p>
            {BUCKETS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  setBucket(b.id);
                  setEmailId(null);
                  if (narrow) setMobileStep(1);
                }}
                className={cn(
                  "w-full rounded-lg border px-2 py-2 text-left text-xs transition",
                  bucket === b.id
                    ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                    : "border-transparent hover:bg-slate-50"
                )}
              >
                {b.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredSuppliers.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSupplierId(s.id);
                  setEmailId(null);
                  if (narrow) setMobileStep(1);
                }}
                className={cn(
                  "relative w-full rounded-lg border-l-4 border border-slate-100 bg-slate-50/80 px-2 py-2 text-left text-xs transition hover:bg-white",
                  statusBarClass(s.status),
                  supplierId === s.id && "ring-1 ring-indigo-300"
                )}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="font-medium text-slate-900">{s.name}</span>
                  {s.unreadCount > 0 ? (
                    <span className="shrink-0 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                      {s.unreadCount > 9 ? "9+" : s.unreadCount}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-500">
                  {s.lastSnippet || "—"}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-slate-100 p-2">
        <Link
          href="/dashboard/suppliers"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "w-full text-xs"
          )}
        >
          + 新增供应商
        </Link>
      </div>
    </div>
  );

  const col2 = (
    <div className="flex h-full min-h-0 w-[320px] shrink-0 flex-col border-r border-slate-200 bg-slate-50/50">
      <div className="border-b border-slate-100 p-2">
        <Input
          placeholder="搜索当前列表…"
          className="h-8 text-xs"
          value={qMid}
          onChange={(e) => setQMid(e.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loadingList ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-6 animate-spin text-indigo-500" />
          </div>
        ) : threads.length === 0 ? (
          <p className="p-4 text-center text-xs text-slate-500">暂无邮件</p>
        ) : (
          threads.map((t) => (
            <button
              key={t.threadId}
              type="button"
              onClick={() => {
                setEmailId(t.threadId);
                if (narrow) setMobileStep(2);
              }}
              className={cn(
                "w-full border-b border-slate-100 px-3 py-2.5 text-left text-xs transition hover:bg-white",
                emailId === t.threadId && "bg-white ring-1 ring-inset ring-indigo-200",
                !t.latest.isRead && "font-semibold text-slate-900"
              )}
            >
              <div className="flex items-center gap-1 text-[10px] text-slate-500">
                <span>{t.latest.direction === "RECEIVED" ? "📩" : "📤"}</span>
                <span>{formatMailTime(t.latest.receivedAt)}</span>
                <span className="rounded bg-slate-200/80 px-1 font-medium text-slate-700">
                  ({t.messageCount})
                </span>
                {t.latest.isStarred ? (
                  <Star className="size-3 shrink-0 fill-amber-400 text-amber-500" />
                ) : null}
                {t.latest.hasAttachments ? <Paperclip className="size-3" /> : null}
                {t.latest.openTodoCount > 0 ? (
                  <span className="ml-auto text-red-500">🔴</span>
                ) : null}
              </div>
              <div className="mt-0.5 line-clamp-2 text-sm">{t.latest.subject}</div>
              {t.latest.summaryCn ? (
                <div className="mt-0.5 line-clamp-1 text-[10px] text-slate-500">
                  {t.latest.summaryCn}
                </div>
              ) : null}
            </button>
          ))
        )}
      </div>
    </div>
  );

  const col3 = (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-white">
      {!detail ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
          选择一封邮件
        </div>
      ) : loadingDetail ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-8 animate-spin text-indigo-500" />
        </div>
      ) : (
        <>
          <div className="border-b border-slate-100 p-4 pb-3">
            <h2 className="font-heading text-xl font-bold leading-snug text-slate-900">
              {detail.subject}
            </h2>
            <p className="mt-2 text-xs text-slate-600">
              <span className="font-medium text-slate-700">发件人</span>{" "}
              {detail.fromAddress}
              <span className="mx-1.5 text-slate-300">→</span>
              <span className="font-medium text-slate-700">收件人</span>{" "}
              {detail.toAddress}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              {new Date(detail.receivedAt).toLocaleString("zh-CN")}
              {threadMessages.length > 1 ? (
                <span className="ml-2 text-slate-500">
                  · 本对话共 {threadMessages.length} 封
                </span>
              ) : null}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 gap-1.5 px-3 text-xs"
                disabled={mailActionBusy}
                onClick={() => setReplyEditorOpen(true)}
              >
                <Reply className="size-3.5 shrink-0" />
                回复
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 gap-1.5 px-3 text-xs"
                disabled={mailActionBusy}
                onClick={() => setForwardOpen(true)}
              >
                <Forward className="size-3.5 shrink-0" />
                转发
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 gap-1.5 px-3 text-xs text-red-700 hover:bg-red-50"
                disabled={mailActionBusy}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-3.5 shrink-0" />
                删除
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 gap-1.5 px-3 text-xs"
                disabled={mailActionBusy}
                onClick={() =>
                  void patchDetailFlags({ isStarred: !detail.isStarred })
                }
              >
                <Star
                  className={cn(
                    "size-3.5 shrink-0",
                    detail.isStarred && "fill-amber-400 text-amber-500"
                  )}
                />
                星标
              </Button>
              {!detail.supplierId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-9 gap-1.5 px-3 text-xs"
                  onClick={() => void openClassify()}
                >
                  📁 归入供应商
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 gap-1.5 px-3 text-xs"
                disabled={mailActionBusy}
                onClick={() =>
                  void patchDetailFlags({ isRead: !detail.isRead })
                }
              >
                <MailOpen className="size-3.5 shrink-0" />
                {detail.isRead ? "标为未读" : "标为已读"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 gap-1.5 px-3 text-xs"
                disabled={mailActionBusy}
                onClick={() => void patchDetailFlags({ isArchived: true })}
              >
                <Archive className="size-3.5 shrink-0" />
                归档
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-40 pt-4">
            {threadMessages.length === 0 ? null : (
              <div className="space-y-3">
                {threadMessages.map((m, idx) => {
                  const isLatest = idx === threadMessages.length - 1;
                  const isOpen = isLatest || expandedMsgIds.has(m.id);
                  const enOpen = bodyEnOpenById[m.id] ?? false;

                  if (!isOpen) {
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          setExpandedMsgIds((prev) => {
                            const n = new Set(prev);
                            n.add(m.id);
                            return n;
                          })
                        }
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-left transition hover:bg-slate-100"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-800">
                            {m.fromAddress}
                          </span>
                          <span className="shrink-0 text-[10px] text-slate-400">
                            {new Date(m.receivedAt).toLocaleString("zh-CN")}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">
                          {msgSnippetText(m)}
                        </p>
                      </button>
                    );
                  }

                  return (
                    <div
                      key={m.id}
                      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                    >
                      {!isLatest ? (
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/50 px-3 py-2">
                          <span className="truncate text-xs text-slate-600">
                            {m.fromAddress} ·{" "}
                            {new Date(m.receivedAt).toLocaleString("zh-CN")}
                          </span>
                          <button
                            type="button"
                            className="shrink-0 text-[10px] font-medium text-indigo-600 hover:underline"
                            onClick={() =>
                              setExpandedMsgIds((prev) => {
                                const n = new Set(prev);
                                n.delete(m.id);
                                return n;
                              })
                            }
                          >
                            收起
                          </button>
                        </div>
                      ) : null}

                      <div className="p-3">
                        <Card className="rounded-xl border-violet-200/90 bg-violet-50/70 p-3 shadow-none">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-violet-950">
                              AI 分析
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-7 gap-1 text-[10px]"
                              disabled={regenTargetId !== null}
                              onClick={() => void regenerateSummaryFor(m.id)}
                            >
                              {regenTargetId === m.id ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Sparkles className="size-3" />
                              )}
                              重新生成摘要
                            </Button>
                          </div>
                          <p className="mt-2 text-[11px] font-medium text-violet-900">
                            📋 中文摘要（约 100 字）
                          </p>
                          <p className="mt-1 text-sm leading-relaxed text-slate-800">
                            {m.summaryCn?.trim() || "暂无摘要"}
                          </p>
                          {m.actionItems?.length ? (
                            <div className="mt-3 border-t border-violet-200/60 pt-2">
                              <p className="text-[11px] font-medium text-violet-900">
                                📝 待办事项
                              </p>
                              <ul className="mt-1.5 space-y-1">
                                {m.actionItems.map((a) => (
                                  <li
                                    key={a.id}
                                    className="flex items-center gap-2 text-xs"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={a.isCompleted}
                                      onChange={(ev) =>
                                        void toggleTodo(
                                          a.id,
                                          ev.target.checked
                                        )
                                      }
                                      className="rounded border-slate-300"
                                    />
                                    <span
                                      className={cn(
                                        a.isCompleted &&
                                          "text-slate-400 line-through"
                                      )}
                                    >
                                      {a.content}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <p className="mt-2 text-[11px] text-slate-500">
                              📝 暂无待办
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-medium text-violet-900">
                              🏷️ 标签
                            </span>
                            {(() => {
                              try {
                                const t = JSON.parse(m.tagsJson || "[]") as string[];
                                if (!t.length) {
                                  return (
                                    <span className="text-[11px] text-slate-500">
                                      暂无
                                    </span>
                                  );
                                }
                                return t.map((x) => (
                                  <Badge
                                    key={x}
                                    variant="secondary"
                                    className="text-[10px]"
                                  >
                                    {x}
                                  </Badge>
                                ));
                              } catch {
                                return (
                                  <span className="text-[11px] text-slate-500">
                                    暂无
                                  </span>
                                );
                              }
                            })()}
                          </div>
                          <p className="mt-2 text-[11px] text-slate-700">
                            <span className="font-medium">紧急程度</span>：{" "}
                            {priLabelFor(m)}
                          </p>
                        </Card>

                        <div className="mt-4">
                          <p className="text-xs font-medium text-slate-600">
                            正文
                          </p>
                          <div className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-3 text-sm leading-[1.6] text-slate-800">
                            {m.bodyZh?.trim() ||
                              m.summaryCn?.trim() ||
                              "暂无中文全文翻译，可点击「重新生成摘要」。"}
                          </div>
                          <button
                            type="button"
                            className="mt-2 text-xs font-medium text-indigo-600 hover:underline"
                            onClick={() =>
                              setBodyEnOpenById((prev) => ({
                                ...prev,
                                [m.id]: !enOpen,
                              }))
                            }
                          >
                            {enOpen ? "收起英文原文 ▲" : "查看英文原文 ▼"}
                          </button>
                          {enOpen ? (
                            <div className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm leading-[1.6] text-slate-700">
                              {m.bodyText}
                            </div>
                          ) : null}
                        </div>

                        {m.attachments?.length ? (
                          <div className="mt-4">
                            <p className="text-xs font-medium text-slate-600">
                              附件
                            </p>
                            <ul className="mt-1 space-y-1">
                              {m.attachments.map((a) => (
                                <li key={a.id}>
                                  <a
                                    href={`/${a.storagePath.replace(/^\/+/, "")}`}
                                    className="text-xs text-indigo-600 hover:underline"
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {a.filename} (
                                    {Math.round(a.sizeBytes / 1024)} KB)
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
            <input
              ref={replyFileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(ev) => {
                const list = ev.target.files;
                if (!list?.length) return;
                setReplyFiles((prev) => [...prev, ...Array.from(list)]);
                ev.target.value = "";
              }}
            />
            {!replyEditorOpen ? (
              <div className="flex gap-2">
                <Input
                  placeholder="用中文写大意，或点「回复」展开完整编辑区…"
                  className="h-9 flex-1 text-sm"
                  value={replyZh}
                  onChange={(e) => setReplyZh(e.target.value)}
                />
                <Button
                  type="button"
                  className="h-9 shrink-0 gap-1.5 px-4"
                  onClick={() => setReplyEditorOpen(true)}
                >
                  <Reply className="size-3.5" />
                  回复
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed"
                  placeholder="用中文写回复大意（不必很正式）…"
                  value={replyZh}
                  onChange={(e) => setReplyZh(e.target.value)}
                />
                {replyFiles.length > 0 ? (
                  <ul className="flex flex-wrap gap-2 text-[11px] text-slate-600">
                    {replyFiles.map((f, i) => (
                      <li
                        key={`${f.name}-${i}`}
                        className="flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5"
                      >
                        <Paperclip className="size-3" />
                        {f.name}
                        <button
                          type="button"
                          className="text-red-600 hover:underline"
                          onClick={() =>
                            setReplyFiles((prev) =>
                              prev.filter((_, j) => j !== i)
                            )
                          }
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => replyFileInputRef.current?.click()}
                  >
                    添加附件
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void polishReplyAndOpenPreview()}
                    disabled={!replyZh.trim() || previewBusy}
                  >
                    {previewBusy ? (
                      <Loader2 className="mr-1 size-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1 size-3.5" />
                    )}
                    AI优化并翻译
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setReplyEditorOpen(false);
                      setReplyFiles([]);
                    }}
                  >
                    收起
                  </Button>
                </div>
              </div>
            )}
          </div>

          <Button
            type="button"
            size="icon"
            className="absolute bottom-28 right-4 size-12 rounded-full shadow-lg"
            onClick={() => setAiOpen(true)}
            title="AI 助手"
          >
            <Bot className="size-5" />
          </Button>
        </>
      )}
    </div>
  );

  const mainGrid = (
    <div className="flex min-h-[calc(100dvh-8rem)] w-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {col1}
      {col2}
      {col3}
    </div>
  );

  const mobileFlow = (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      {mobileStep > 0 ? (
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
      ) : null}
      {mobileStep === 0 ? col1 : null}
      {mobileStep === 1 ? col2 : null}
      {mobileStep === 2 ? col3 : null}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-slate-900">
            邮件中心
          </h1>
          <p className="text-xs text-slate-500">
            英文沟通 · 中文阅读 · 发送前自动翻译（需配置 Claude 与 SMTP）
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
            手动同步邮件
          </Button>
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

      {syncErrText ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-950">
          <p className="text-sm font-medium">同步失败（完整错误便于调试）</p>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
            {syncErrText}
          </pre>
        </div>
      ) : null}

      {syncStep >= 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-700">
            {SYNC_STEPS.map((base, i) => {
              const label = i === 3 ? (syncDoneLabel ?? "完成") : base;
              const past = syncStep > i;
              const current = syncStep === i;
              return (
                <span key={`${base}-${i}`} className="inline-flex items-center gap-2">
                  {i > 0 ? (
                    <span className="select-none text-slate-300" aria-hidden>
                      →
                    </span>
                  ) : null}
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
          {syncSubtext ? (
            <p className="mt-1.5 text-[11px] text-slate-600">{syncSubtext}</p>
          ) : null}
        </div>
      ) : null}

      {narrow ? mobileFlow : mainGrid}

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>确认发送</DialogTitle>
            <DialogDescription>
              左侧为您的中文大意，右侧为可编辑的英文正文，确认后通过 SMTP 发出。
            </DialogDescription>
          </DialogHeader>
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
              disabled={sendBusy || !replyEnPreview.trim()}
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

      <Dialog open={forwardOpen} onOpenChange={setForwardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>转发邮件</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">收件人邮箱</Label>
              <Input
                className="mt-1"
                placeholder="name@example.com"
                value={forwardTo}
                onChange={(e) => setForwardTo(e.target.value)}
              />
            </div>
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
              disabled={forwardBusy || !forwardTo.trim()}
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

      <Sheet open={aiOpen} onOpenChange={setAiOpen}>
        <SheetContent
          side="right"
          className="flex w-full max-w-[min(100vw,360px)] flex-col sm:max-w-[320px]"
        >
          <SheetHeader>
            <SheetTitle>🤖 AI 助手</SheetTitle>
          </SheetHeader>
          <Tabs value={aiTab} onValueChange={setAiTab} className="mt-4 flex min-h-0 flex-1 flex-col">
            <TabsList className="grid h-auto shrink-0 grid-cols-2 gap-1">
              <TabsTrigger value="translate" className="text-[10px]">
                🌐 翻译
              </TabsTrigger>
              <TabsTrigger value="decision" className="text-[10px]">
                💡 采购建议
              </TabsTrigger>
              <TabsTrigger value="asin" className="text-[10px]">
                📊 ASIN
              </TabsTrigger>
              <TabsTrigger value="free" className="text-[10px]">
                💬 提问
              </TabsTrigger>
            </TabsList>
            <TabsContent value="translate" className="mt-3 flex min-h-0 flex-1 flex-col space-y-2">
              <textarea
                className="min-h-[120px] w-full rounded-md border p-2 text-sm"
                placeholder="输入文本…"
                value={aiTranslateIn}
                onChange={(e) => setAiTranslateIn(e.target.value)}
              />
              <Button type="button" size="sm" onClick={() => void runAiTranslate()}>
                翻译
              </Button>
              <pre className="min-h-[80px] flex-1 whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-xs">
                {aiTranslateOut}
              </pre>
            </TabsContent>
            <TabsContent value="decision" className="mt-3 space-y-2">
              <Button type="button" size="sm" onClick={() => void runAiDecision()}>
                基于当前邮件生成建议
              </Button>
              <pre className="max-h-[60vh] whitespace-pre-wrap text-xs">{aiDecisionOut}</pre>
            </TabsContent>
            <TabsContent value="asin" className="mt-3 space-y-2">
              <Input
                placeholder="输入 ASIN"
                value={asinQ}
                onChange={(e) => setAsinQ(e.target.value)}
              />
              <p className="text-xs text-slate-500">
                卖家精灵数据对接可在后续接入；此处预留快捷入口。
              </p>
            </TabsContent>
            <TabsContent value="free" className="mt-3 space-y-2">
              <textarea
                className="min-h-[100px] w-full rounded-md border p-2 text-sm"
                value={freeQ}
                onChange={(e) => setFreeQ(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                onClick={async () => {
                  const r = await fetch("/api/mail/translate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      text: freeQ,
                      hint: detail
                        ? `上下文邮件主题：${detail.subject}`
                        : undefined,
                    }),
                  });
                  const j = await r.json().catch(() => ({}));
                  setAiTranslateOut((j as { text?: string }).text ?? "");
                }}
              >
                发送给 AI（走翻译通道）
              </Button>
              <pre className="text-xs text-slate-600">{aiTranslateOut}</pre>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </div>
  );
}
