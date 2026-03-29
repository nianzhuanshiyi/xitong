"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Clock,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AnalysisMarkdown } from "@/components/product-analysis/analysis-markdown";
import { useMailContext } from "./mail-context";

type AnalysisListItem = {
  id: string;
  productName: string;
  query: string;
  score: number | null;
  recommendation: string | null;
  status: string;
  emailId: string | null;
  supplierId: string | null;
  createdAt: string;
  email?: { subject: string } | null;
  supplier?: { name: string } | null;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type AnalysisDetail = {
  id: string;
  productName: string;
  query: string;
  analysisResult: string | null;
  marketData: string | null;
  score: number | null;
  recommendation: string | null;
  status: string;
  emailId: string | null;
  supplierId: string | null;
  createdAt: string;
  chats: ChatMessage[];
  email?: { subject: string; fromAddress: string; summaryCn: string | null } | null;
  supplier?: { name: string } | null;
};

const REC_LABELS: Record<string, { label: string; color: string }> = {
  strong_yes: { label: "强烈推荐", color: "bg-emerald-500" },
  yes: { label: "推荐", color: "bg-green-500" },
  maybe: { label: "可考虑", color: "bg-amber-500" },
  no: { label: "不推荐", color: "bg-orange-500" },
  strong_no: { label: "强烈不推荐", color: "bg-red-500" },
};

function ScoreCard({ score, recommendation }: { score: number | null; recommendation: string | null }) {
  if (score == null) return null;
  const rec = recommendation ? REC_LABELS[recommendation] : null;
  const color =
    score >= 80 ? "text-emerald-600 border-emerald-200 bg-emerald-50" :
    score >= 60 ? "text-amber-600 border-amber-200 bg-amber-50" :
    "text-red-600 border-red-200 bg-red-50";

  return (
    <div className={cn("flex items-center gap-3 rounded-lg border p-3", color)}>
      <div className="text-3xl font-bold">{score}</div>
      <div className="text-xs">
        <div className="font-medium">综合评分</div>
        {rec && (
          <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium text-white", rec.color)}>
            {rec.label}
          </span>
        )}
      </div>
    </div>
  );
}

export function MailAnalysisPanel() {
  const ctx = useMailContext();
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Panel state
  const [view, setView] = useState<"input" | "detail" | "history">("input");
  const [query, setQuery] = useState("");
  const [fetchMarket, setFetchMarket] = useState(false);
  const [creating, setCreating] = useState(false);

  // Current analysis
  const [current, setCurrent] = useState<AnalysisDetail | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  // History
  const [history, setHistory] = useState<AnalysisListItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  // Load history when panel opens or supplier changes
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (ctx.supplierId) params.set("supplierId", ctx.supplierId);
      const r = await fetch(`/api/mail/ai-analysis?${params}`);
      if (r.ok) {
        const j = (await r.json()) as { items: AnalysisListItem[] };
        setHistory(j.items);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, [ctx.supplierId]);

  useEffect(() => {
    if (ctx.aiOpen) void loadHistory();
  }, [ctx.aiOpen, loadHistory]);

  // Load analysis detail
  async function loadDetail(id: string) {
    const r = await fetch(`/api/mail/ai-analysis/${id}`);
    if (!r.ok) {
      toast.error("加载分析详情失败");
      return;
    }
    const j = (await r.json()) as { analysis: AnalysisDetail };
    setCurrent(j.analysis);
    setView("detail");
    scrollToBottom();
  }

  // Create new analysis
  async function createAnalysis() {
    if (!query.trim()) return;
    setCreating(true);
    try {
      const r = await fetch("/api/mail/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          emailId: ctx.detail?.id || undefined,
          supplierId: ctx.detail?.supplierId || ctx.supplierId || undefined,
          fetchMarketData: fetchMarket,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error((j as { message?: string }).message ?? "分析失败");
        return;
      }
      const analysis = (j as { analysis: AnalysisDetail }).analysis;
      // Reload to get chats
      await loadDetail(analysis.id);
      setQuery("");
      void loadHistory();
    } finally {
      setCreating(false);
    }
  }

  // Send follow-up chat
  async function sendChat() {
    if (!current || !chatInput.trim()) return;
    setChatBusy(true);
    try {
      const r = await fetch(`/api/mail/ai-analysis/${current.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: chatInput.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error((j as { message?: string }).message ?? "追问失败");
        return;
      }
      const aiMsg = (j as { message: string }).message;
      // Append to current chats locally
      setCurrent((prev) => {
        if (!prev) return prev;
        const now = new Date().toISOString();
        return {
          ...prev,
          chats: [
            ...prev.chats,
            { id: `tmp-u-${Date.now()}`, role: "user", content: chatInput.trim(), createdAt: now },
            { id: `tmp-a-${Date.now()}`, role: "assistant", content: aiMsg, createdAt: now },
          ],
        };
      });
      setChatInput("");
      scrollToBottom();
    } finally {
      setChatBusy(false);
    }
  }

  // Delete analysis
  async function deleteAnalysis(id: string) {
    const r = await fetch(`/api/mail/ai-analysis/${id}`, { method: "DELETE" });
    if (!r.ok) {
      toast.error("删除失败");
      return;
    }
    toast.success("已删除");
    if (current?.id === id) {
      setCurrent(null);
      setView("input");
    }
    void loadHistory();
  }

  if (!ctx.aiOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col border-l border-slate-200 bg-white shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-violet-600" />
          <h3 className="text-sm font-semibold text-slate-900">AI 产品分析助手</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant={view === "history" ? "secondary" : "ghost"}
            className="h-7 gap-1 text-[11px]"
            onClick={() => setView(view === "history" ? (current ? "detail" : "input") : "history")}
          >
            <Clock className="size-3" />
            历史
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="size-7 p-0"
            onClick={() => ctx.setAiOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* History view */}
      {view === "history" && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {historyLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-slate-400" />
            </div>
          ) : history.length === 0 ? (
            <p className="p-4 text-center text-xs text-slate-400">暂无分析历史</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex items-start gap-2 px-4 py-3 hover:bg-slate-50"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => void loadDetail(h.id)}
                  >
                    <div className="flex items-center gap-1.5">
                      {h.score != null && (
                        <span className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-white",
                          h.score >= 80 ? "bg-emerald-500" : h.score >= 60 ? "bg-amber-500" : "bg-red-500"
                        )}>
                          {h.score}
                        </span>
                      )}
                      <span className="truncate text-xs font-medium text-slate-800">
                        {h.productName || h.query.slice(0, 40)}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-500">
                      {h.query}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
                      {h.supplier && <span>{h.supplier.name}</span>}
                      <span>{new Date(h.createdAt).toLocaleDateString("zh-CN")}</span>
                    </div>
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="size-6 shrink-0 p-0 text-slate-400 hover:text-red-500"
                    onClick={() => void deleteAnalysis(h.id)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-slate-100 p-3">
            <Button
              type="button"
              size="sm"
              className="w-full gap-1"
              onClick={() => { setCurrent(null); setView("input"); }}
            >
              <Sparkles className="size-3.5" />
              新建分析
            </Button>
          </div>
        </div>
      )}

      {/* Input view - new analysis */}
      {view === "input" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-4">
            {/* Linked email context */}
            {ctx.detail && (
              <div className="mb-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-2.5">
                <p className="text-[10px] font-medium text-indigo-600">已关联邮件</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-700">
                  {ctx.detail.subject}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  {ctx.detail.fromAddress}
                </p>
              </div>
            )}

            <p className="text-xs text-slate-500">
              输入你想分析的问题，AI 会结合邮件上下文给出专业分析。
            </p>

            <textarea
              className="mt-3 min-h-[120px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm leading-relaxed placeholder:text-slate-400 focus:border-violet-300 focus:outline-none focus:ring-1 focus:ring-violet-300"
              placeholder="例如：帮我分析这封邮件里推荐的玻尿酸精华成分是否安全、这个产品在美国市场有机会吗…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />

            <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={fetchMarket}
                onChange={(e) => setFetchMarket(e.target.checked)}
                className="rounded border-slate-300"
              />
              同时查询卖家精灵市场数据
            </label>

            {/* Quick history */}
            {history.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-medium text-slate-500">最近分析</p>
                <div className="mt-1 space-y-1">
                  {history.slice(0, 3).map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                      onClick={() => void loadDetail(h.id)}
                    >
                      <ChevronRight className="size-3 shrink-0 text-slate-400" />
                      <span className="truncate text-slate-700">
                        {h.productName || h.query.slice(0, 30)}
                      </span>
                      {h.score != null && (
                        <span className={cn(
                          "ml-auto shrink-0 rounded px-1 text-[10px] font-bold text-white",
                          h.score >= 80 ? "bg-emerald-500" : h.score >= 60 ? "bg-amber-500" : "bg-red-500"
                        )}>
                          {h.score}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 p-3">
            <Button
              type="button"
              className="w-full gap-1.5"
              disabled={!query.trim() || creating}
              onClick={() => void createAnalysis()}
            >
              {creating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {creating ? "分析中…" : "开始分析"}
            </Button>
          </div>
        </div>
      )}

      {/* Detail view - analysis result + chat */}
      {view === "detail" && current && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Back button + title */}
            <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-4 py-2 backdrop-blur">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[11px]"
                  onClick={() => { setCurrent(null); setView("input"); }}
                >
                  ← 新分析
                </Button>
                <span className="truncate text-xs font-medium text-slate-700">
                  {current.productName || "产品分析"}
                </span>
              </div>
            </div>

            {/* Score card */}
            {current.score != null && (
              <div className="px-4 pt-3">
                <ScoreCard score={current.score} recommendation={current.recommendation} />
              </div>
            )}

            {/* Linked email info */}
            {current.email && (
              <div className="mx-4 mt-3 rounded-lg border border-slate-100 bg-slate-50 p-2 text-[10px] text-slate-500">
                关联邮件: {current.email.subject}
              </div>
            )}

            {/* Market data */}
            {current.marketData && (
              <div className="mx-4 mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
                <p className="text-[10px] font-medium text-blue-700">卖家精灵市场数据</p>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] text-slate-700">
                  {current.marketData}
                </pre>
              </div>
            )}

            {/* Chat messages */}
            <div className="px-4 py-3">
              <div className="space-y-3">
                {current.chats.map((msg) => (
                  <div key={msg.id}>
                    {msg.role === "user" ? (
                      <div className="flex justify-end">
                        <div className="max-w-[85%] rounded-xl rounded-tr-sm bg-violet-600 px-3 py-2 text-sm text-white">
                          {msg.content}
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-full">
                        <div className="rounded-xl rounded-tl-sm border border-slate-100 bg-slate-50 px-3 py-2">
                          <AnalysisMarkdown content={msg.content} />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {chatBusy && (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Loader2 className="size-3.5 animate-spin" />
                    AI 正在思考…
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>
          </div>

          {/* Follow-up input */}
          <div className="border-t border-slate-100 p-3">
            <div className="flex gap-2">
              <Input
                className="h-9 flex-1 text-sm"
                placeholder="继续追问…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && chatInput.trim() && !chatBusy) {
                    e.preventDefault();
                    void sendChat();
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                className="h-9 shrink-0 gap-1 px-3"
                disabled={!chatInput.trim() || chatBusy}
                onClick={() => void sendChat()}
              >
                {chatBusy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
