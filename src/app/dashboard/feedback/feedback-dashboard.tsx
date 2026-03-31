"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Trash2,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* ── Mappings ─────────────────────────────────────── */

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  bug: { label: "Bug 报告", color: "bg-red-100 text-red-700 border-red-200" },
  feature: { label: "功能建议", color: "bg-blue-100 text-blue-700 border-blue-200" },
  question: { label: "使用问题", color: "bg-amber-100 text-amber-700 border-amber-200" },
  other: { label: "其他", color: "bg-gray-100 text-gray-600 border-gray-200" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "待处理", color: "bg-amber-100 text-amber-700" },
  processing: { label: "处理中", color: "bg-blue-100 text-blue-700" },
  resolved: { label: "已解决", color: "bg-green-100 text-green-700" },
  closed: { label: "已关闭", color: "bg-gray-100 text-gray-600" },
};

const MODULE_OPTIONS = [
  { value: "analysis", label: "选品分析" },
  { value: "au-dev", label: "澳洲开发" },
  { value: "beauty-ideas", label: "美妆新品" },
  { value: "3c-ideas", label: "3C新品" },
  { value: "europe-ideas", label: "欧洲蓝海" },
  { value: "listing", label: "Listing撰写" },
  { value: "ai-image", label: "AI图片" },
  { value: "ai-assistant", label: "AI助手" },
  { value: "other", label: "其他" },
];

const MODULE_LABELS: Record<string, string> = Object.fromEntries(
  MODULE_OPTIONS.map((m) => [m.value, m.label])
);

/* ── Types ─────────────────────────────────────────── */

interface FeedbackUser {
  id: string;
  name: string | null;
  email: string | null;
}

interface FeedbackItem {
  id: string;
  type: string;
  title: string;
  description: string;
  screenshot: string | null;
  module: string | null;
  status: string;
  reply: string | null;
  repliedAt: string | null;
  userId: string;
  user: FeedbackUser;
  createdAt: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${min}`;
}

/* ── Component ─────────────────────────────────────── */

export function FeedbackDashboard() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<{ id: string; name: string | null }[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters (admin only)
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterModule, setFilterModule] = useState("all");
  const [filterUser, setFilterUser] = useState("all");

  // Submit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    type: "bug",
    title: "",
    description: "",
    screenshot: "",
    module: "",
  });

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Admin reply
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterType !== "all") params.set("type", filterType);
      if (filterModule !== "all") params.set("module", filterModule);
      if (filterUser !== "all") params.set("userId", filterUser);

      const res = await fetch(`/api/feedback?${params}`);
      if (!res.ok) throw new Error("获取数据失败");
      const data = await res.json();
      setItems(data.items);
      setTotalPages(data.totalPages);
      setTotal(data.total);
      setIsAdmin(data.isAdmin);
      if (data.users) setUsers(data.users);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, filterType, filterModule, filterUser]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(1);
  }, [filterStatus, filterType, filterModule, filterUser]);

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.description.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          title: form.title.trim(),
          description: form.description.trim(),
          screenshot: form.screenshot.trim() || undefined,
          module: form.module || undefined,
        }),
      });
      if (!res.ok) throw new Error("提交失败");
      setForm({ type: "bug", title: "", description: "", screenshot: "", module: "" });
      setDialogOpen(false);
      fetchData();
    } catch {
      alert("提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await fetch(`/api/feedback/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchData();
    } catch {
      alert("更新失败");
    }
  };

  const handleReply = async (id: string) => {
    if (!replyText.trim()) return;
    setReplying(true);
    try {
      await fetch(`/api/feedback/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: replyText.trim() }),
      });
      setReplyText("");
      fetchData();
    } catch {
      alert("回复失败");
    } finally {
      setReplying(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除此反馈？")) return;
    try {
      await fetch(`/api/feedback/${id}`, { method: "DELETE" });
      fetchData();
    } catch {
      alert("删除失败");
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold text-slate-900 sm:text-xl">
            需求反馈
          </h2>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm">
            {isAdmin ? `所有反馈，共 ${total} 条` : "提交问题、Bug 或功能建议"}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> 提交反馈
        </Button>
      </div>

      {/* Submit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <DialogTitle>提交反馈</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>类型</Label>
                <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v ?? "bug" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bug">Bug 报告</SelectItem>
                    <SelectItem value="feature">功能建议</SelectItem>
                    <SelectItem value="question">使用问题</SelectItem>
                    <SelectItem value="other">其他</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>相关模块</Label>
                <Select value={form.module || "none"} onValueChange={(v) => setForm((p) => ({ ...p, module: v === "none" ? "" : (v ?? "") }))}>
                  <SelectTrigger><SelectValue placeholder="选择模块" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不选</SelectItem>
                    {MODULE_OPTIONS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>标题</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="简要描述问题或建议"
              />
            </div>
            <div className="space-y-1.5">
              <Label>详细描述</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="请详细描述你遇到的问题或建议的功能..."
                className="min-h-[120px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>截图链接（可选）</Label>
              <Input
                value={form.screenshot}
                onChange={(e) => setForm((p) => ({ ...p, screenshot: e.target.value }))}
                placeholder="粘贴截图 URL"
              />
            </div>
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={submitting || !form.title.trim() || !form.description.trim()}
            >
              {submitting ? "提交中..." : "提交反馈"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin Filters */}
      {isAdmin && (
        <div className="flex gap-3 flex-wrap">
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v ?? "all")}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={(v) => setFilterType(v ?? "all")}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="全部类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterModule} onValueChange={(v) => setFilterModule(v ?? "all")}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="全部模块" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部模块</SelectItem>
              {MODULE_OPTIONS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterUser} onValueChange={(v) => setFilterUser(v ?? "all")}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="全部员工" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部员工</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name || "未命名"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          <span className="ml-2 text-sm text-muted-foreground">加载中...</span>
        </div>
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-20">暂无反馈记录</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const typeInfo = TYPE_LABELS[item.type] || TYPE_LABELS.other;
            const statusInfo = STATUS_LABELS[item.status] || STATUS_LABELS.pending;
            const expanded = expandedId === item.id;

            return (
              <div key={item.id} className="rounded-lg border">
                {/* Row header */}
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30"
                  onClick={() => {
                    setExpandedId(expanded ? null : item.id);
                    setReplyText(item.reply || "");
                  }}
                >
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium shrink-0 ${typeInfo.color}`}>
                    {typeInfo.label}
                  </span>
                  <span className="font-medium text-sm flex-1 min-w-0 truncate">{item.title}</span>
                  {item.module && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {MODULE_LABELS[item.module] || item.module}
                    </span>
                  )}
                  {isAdmin && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {item.user.name || item.user.email || "—"}
                    </span>
                  )}
                  <Badge className={`text-[10px] shrink-0 ${statusInfo.color}`} variant="secondary">
                    {statusInfo.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatTime(item.createdAt)}
                  </span>
                  {expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </div>

                {/* Expanded detail */}
                {expanded && (
                  <div className="border-t px-4 py-3 space-y-3">
                    <div className="text-sm whitespace-pre-wrap text-muted-foreground">
                      {item.description}
                    </div>

                    {item.screenshot && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">截图：</p>
                        <a href={item.screenshot} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline break-all">
                          {item.screenshot}
                        </a>
                      </div>
                    )}

                    {/* Reply display */}
                    {item.reply && (
                      <div className="rounded-lg bg-blue-50/70 border border-blue-100 p-3">
                        <p className="text-xs font-medium text-blue-700 mb-1">
                          管理员回复 {item.repliedAt && `· ${formatTime(item.repliedAt)}`}
                        </p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{item.reply}</p>
                      </div>
                    )}

                    {/* Admin actions */}
                    {isAdmin && (
                      <div className="space-y-3 pt-1">
                        <div className="flex items-center gap-3">
                          <Label className="text-xs shrink-0">状态：</Label>
                          <Select
                            value={item.status}
                            onValueChange={(v) => v && handleStatusChange(item.id, v)}
                          >
                            <SelectTrigger className="w-[130px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                                <SelectItem key={k} value={k}>{v.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="flex-1" />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDelete(item.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="flex gap-2">
                          <Textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="输入回复..."
                            className="min-h-[60px] text-sm"
                          />
                          <Button
                            size="sm"
                            className="shrink-0 self-end"
                            onClick={() => handleReply(item.id)}
                            disabled={replying || !replyText.trim()}
                          >
                            {replying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            第 {page} / {totalPages} 页
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
