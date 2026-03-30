"use client";

import { createContext, useContext } from "react";
import type { MailDetail } from "@/lib/mail/fixtures";
import type { MailThreadSummary } from "@/lib/mail/threading";

export type SupplierRow = {
  id: string;
  name: string;
  status: string;
  unreadCount: number;
  lastSnippet: string;
  lastAt: string;
};

export const BUCKETS: { id: string; label: string }[] = [
  { id: "logistics", label: "物流通知" },
  { id: "invoice", label: "账单" },
  { id: "inquiry", label: "新供应商询盘" },
  { id: "fair", label: "展会邀请" },
  { id: "other", label: "其他" },
];

export function formatMailTime(iso: string) {
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

export function statusBarClass(status: string) {
  if (status === "COOPERATING") return "border-l-green-500";
  if (status === "EVALUATING") return "border-l-blue-500";
  return "border-l-slate-400";
}

export function priLabelFor(m: MailDetail) {
  return m.priority === "URGENT"
    ? "紧急"
    : m.priority === "LOW"
      ? "低"
      : "一般";
}

export function priColorClass(priority?: string) {
  if (priority === "URGENT") return "bg-red-500";
  if (priority === "LOW") return "bg-green-500";
  return "bg-blue-500";
}

export function msgSnippetText(m: MailDetail) {
  if (m.summaryCn?.trim()) return m.summaryCn.trim();
  const t = m.bodyZh?.trim() || m.bodyText?.trim() || "";
  if (!t) return "（无内容）";
  return t.length > 100 ? `${t.slice(0, 100)}…` : t;
}

export async function filesToAttachments(files: File[]) {
  const out: { filename: string; contentType: string; contentBase64: string }[] = [];
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

export interface MailContextValue {
  // Left panel state
  leftTab: "all" | "suppliers";
  setLeftTab: (v: "all" | "suppliers") => void;
  bucket: string | null;
  setBucket: (v: string | null) => void;
  supplierId: string | null;
  setSupplierId: (v: string | null) => void;
  suppliers: SupplierRow[];
  qLeft: string;
  setQLeft: (v: string) => void;
  filteredSuppliers: SupplierRow[];

  // Middle list state
  threads: MailThreadSummary[];
  emailId: string | null;
  setEmailId: (v: string | null) => void;
  qMid: string;
  setQMid: (v: string) => void;
  loadingList: boolean;

  // Detail state
  detail: MailDetail | null;
  threadMessages: MailDetail[];
  loadingDetail: boolean;
  expandedMsgIds: Set<string>;
  setExpandedMsgIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  bodyEnOpenById: Record<string, boolean>;
  setBodyEnOpenById: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  mailActionBusy: boolean;

  // Actions
  patchDetailFlags: (data: Partial<{ isRead: boolean; isStarred: boolean; isArchived: boolean; supplierId: null }>) => Promise<void>;
  toggleTodo: (todoId: string, done: boolean) => Promise<void>;
  regenerateSummaryFor: (targetEmailId: string) => Promise<void>;
  regenTargetId: string | null;
  openClassify: () => Promise<void>;

  // Reply state
  replyEditorOpen: boolean;
  setReplyEditorOpen: (v: boolean) => void;
  replyZh: string;
  setReplyZh: (v: string) => void;
  replyFiles: File[];
  setReplyFiles: React.Dispatch<React.SetStateAction<File[]>>;
  replyFileInputRef: React.RefObject<HTMLInputElement | null>;
  polishReplyAndOpenPreview: () => Promise<void>;
  previewBusy: boolean;

  // Forward state
  forwardOpen: boolean;
  setForwardOpen: (v: boolean) => void;
  forwardTo: string;
  setForwardTo: (v: string) => void;
  forwardNote: string;
  setForwardNote: (v: string) => void;
  forwardBusy: boolean;
  submitForward: () => Promise<void>;

  // Delete state
  deleteOpen: boolean;
  setDeleteOpen: (v: boolean) => void;
  deleteBusy: boolean;
  confirmSoftDelete: () => Promise<void>;

  // Send preview state
  sendOpen: boolean;
  setSendOpen: (v: boolean) => void;
  replyEnPreview: string;
  setReplyEnPreview: (v: string) => void;
  sendBusy: boolean;
  confirmSend: () => Promise<void>;

  // Classify state
  classifyOpen: boolean;
  setClassifyOpen: (v: boolean) => void;
  classifySupplierId: string;
  setClassifySupplierId: (v: string) => void;
  classifyDomain: boolean;
  setClassifyDomain: (v: boolean) => void;
  supplierSearch: string;
  setSupplierSearch: (v: string) => void;
  allSuppliers: { id: string; name: string }[];
  submitClassify: () => Promise<void>;

  // AI panel state
  aiOpen: boolean;
  setAiOpen: (v: boolean) => void;
  aiTab: string;
  setAiTab: (v: string) => void;
  aiTranslateIn: string;
  setAiTranslateIn: (v: string) => void;
  aiTranslateOut: string;
  setAiTranslateOut: (v: string) => void;
  aiDecisionOut: string;
  runAiTranslate: () => Promise<void>;
  runAiDecision: () => Promise<void>;
  asinQ: string;
  setAsinQ: (v: string) => void;
  freeQ: string;
  setFreeQ: (v: string) => void;

  // Reply/Forward recipients
  replyTo: string[];
  setReplyTo: React.Dispatch<React.SetStateAction<string[]>>;
  replyCc: string[];
  setReplyCc: React.Dispatch<React.SetStateAction<string[]>>;
  replyBcc: string[];
  setReplyBcc: React.Dispatch<React.SetStateAction<string[]>>;
  forwardCc: string[];
  setForwardCc: React.Dispatch<React.SetStateAction<string[]>>;
  forwardBcc: string[];
  setForwardBcc: React.Dispatch<React.SetStateAction<string[]>>;
  forwardToList: string[];
  setForwardToList: React.Dispatch<React.SetStateAction<string[]>>;

  // Compose (new email)
  composeOpen: boolean;
  setComposeOpen: (v: boolean) => void;
  composeTo: string[];
  setComposeTo: React.Dispatch<React.SetStateAction<string[]>>;
  composeCc: string[];
  setComposeCc: React.Dispatch<React.SetStateAction<string[]>>;
  composeBcc: string[];
  setComposeBcc: React.Dispatch<React.SetStateAction<string[]>>;
  composeSubject: string;
  setComposeSubject: (v: string) => void;
  composeBodyZh: string;
  setComposeBodyZh: (v: string) => void;
  composeBodyEn: string;
  setComposeBodyEn: (v: string) => void;
  composeFiles: File[];
  setComposeFiles: React.Dispatch<React.SetStateAction<File[]>>;
  composeBusy: boolean;
  composeSendStep: "edit" | "preview";
  setComposeSendStep: (v: "edit" | "preview") => void;
  composeTranslateAndPreview: () => Promise<void>;
  composeConfirmSend: () => Promise<void>;

  // Email accounts
  accounts: { id: string; email: string; displayName: string | null }[];
  selectedAccountId: string;
  setSelectedAccountId: (v: string) => void;

  // List refresh
  refreshList: () => void;

  // Sync state
  syncBusy: boolean;
  syncMail: () => Promise<void>;
  syncStep: number;
  syncSubtext: string | null;
  syncDoneLabel: string | null;
  syncErrText: string | null;
  lastSyncTime: string | null;
  batchSumBusy: boolean;
  batchRegenerateSummaries: () => Promise<void>;

  // Mobile
  narrow: boolean;
  mobileStep: 0 | 1 | 2;
  setMobileStep: React.Dispatch<React.SetStateAction<0 | 1 | 2>>;
}

export const MailContext = createContext<MailContextValue>(null!);

export function useMailContext() {
  return useContext(MailContext);
}
