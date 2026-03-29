"use client";

import { useCallback, useState } from "react";
import {
  Archive,
  CheckSquare,
  Loader2,
  Mail,
  MailOpen,
  Paperclip,
  Square,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useMailContext, formatMailTime } from "./mail-context";

type BatchAction = "markRead" | "markUnread" | "archive" | "delete";

export function MailList() {
  const ctx = useMailContext();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const threadIds = ctx.threads.map((t) => t.threadId);
  const allSelected = threadIds.length > 0 && threadIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(threadIds));
    }
  };

  const clearSelection = () => setSelected(new Set());

  // Collect all email IDs from selected threads
  const getSelectedEmailIds = useCallback((): string[] => {
    // threadId is typically the root email ID; for batch ops we use it directly
    return Array.from(selected);
  }, [selected]);

  const runBatch = async (action: BatchAction) => {
    const ids = getSelectedEmailIds();
    if (ids.length === 0) return;
    setBatchBusy(true);
    try {
      const r = await fetch("/api/mail/emails/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        toast.error((j as { message?: string }).message ?? "操作失败");
        return;
      }
      const labels: Record<BatchAction, string> = {
        markRead: "已标记为已读",
        markUnread: "已标记为未读",
        archive: "已归档",
        delete: "已删除",
      };
      toast.success(`${labels[action]} (${ids.length} 封)`);
      clearSelection();
      // Refresh list
      window.dispatchEvent(new Event("xitong-mail-stats-refresh"));
    } finally {
      setBatchBusy(false);
    }
  };

  // When batch completes, we need to reload the email list
  // This is handled by the workspace via the loadEmails effect

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50/50">
      {/* Top bar: search or batch actions */}
      <div className="border-b border-slate-100 p-2">
        {someSelected ? (
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-xs font-medium text-slate-700">
              已选 {selected.size} 封
            </span>
            <div className="flex flex-1 flex-wrap items-center justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px]"
                disabled={batchBusy}
                onClick={() => void runBatch("markRead")}
              >
                <MailOpen className="size-3.5" />
                已读
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px]"
                disabled={batchBusy}
                onClick={() => void runBatch("archive")}
              >
                <Archive className="size-3.5" />
                归档
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px] text-red-600 hover:text-red-700"
                disabled={batchBusy}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="size-3.5" />
                删除
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-1.5 text-[11px]"
                onClick={clearSelection}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <Input
            placeholder="搜索当前列表…"
            className="h-8 text-xs"
            value={ctx.qMid}
            onChange={(e) => ctx.setQMid(e.target.value)}
          />
        )}
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {ctx.loadingList ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-6 animate-spin text-indigo-500" />
          </div>
        ) : ctx.threads.length === 0 ? (
          <p className="p-4 text-center text-xs text-slate-500">暂无邮件</p>
        ) : (
          <>
            {/* Select all row */}
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-1.5">
              <button
                type="button"
                className="shrink-0 text-slate-400 hover:text-indigo-600"
                onClick={toggleAll}
              >
                {allSelected ? (
                  <CheckSquare className="size-4 text-indigo-600" />
                ) : (
                  <Square className="size-4" />
                )}
              </button>
              <span className="text-[10px] text-slate-400">
                {allSelected ? "取消全选" : "全选"}
              </span>
            </div>

            {ctx.threads.map((t) => {
              const isActive = ctx.emailId === t.threadId;
              const isUnread = !t.latest.isRead;
              const isChecked = selected.has(t.threadId);
              return (
                <div
                  key={t.threadId}
                  className={cn(
                    "group relative flex border-b border-slate-100 transition",
                    isActive
                      ? "bg-white ring-1 ring-inset ring-indigo-200"
                      : "hover:bg-white",
                    isUnread && "bg-blue-50/60"
                  )}
                >
                  {/* Checkbox */}
                  <button
                    type="button"
                    className="flex shrink-0 items-center px-2 text-slate-400 hover:text-indigo-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleOne(t.threadId);
                    }}
                  >
                    {isChecked ? (
                      <CheckSquare className="size-4 text-indigo-600" />
                    ) : (
                      <Square className="size-4" />
                    )}
                  </button>

                  {/* Email content */}
                  <button
                    type="button"
                    onClick={() => {
                      ctx.setEmailId(t.threadId);
                      if (ctx.narrow) ctx.setMobileStep(2);
                    }}
                    className="min-w-0 flex-1 py-2.5 pr-3 text-left text-xs"
                  >
                    {/* Priority color bar */}
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l bg-blue-500" />

                    <div className="flex items-center gap-1 text-[10px] text-slate-500">
                      <span>{t.latest.direction === "RECEIVED" ? "📩" : "📤"}</span>
                      <span>{formatMailTime(t.latest.receivedAt)}</span>
                      <span className="rounded bg-slate-200/80 px-1 font-medium text-slate-700">
                        ({t.messageCount})
                      </span>
                      {t.latest.isStarred && (
                        <Star className="size-3 shrink-0 fill-amber-400 text-amber-500" />
                      )}
                      {t.latest.hasAttachments && <Paperclip className="size-3" />}
                      {t.latest.openTodoCount > 0 && (
                        <span className="ml-auto rounded-full bg-red-100 px-1.5 text-[10px] font-medium text-red-600">
                          待办
                        </span>
                      )}
                    </div>

                    <div
                      className={cn(
                        "mt-0.5 line-clamp-2 text-sm",
                        isUnread ? "font-semibold text-slate-900" : "text-slate-700"
                      )}
                    >
                      {t.latest.subject}
                    </div>

                    {t.latest.summaryCn && (
                      <div className="mt-0.5 line-clamp-1 text-[10px] text-slate-500">
                        {t.latest.summaryCn}
                      </div>
                    )}
                  </button>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认批量删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            确定要删除选中的 {selected.size} 封邮件吗？邮件将标记为已删除（软删除）。
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={batchBusy}
              onClick={async () => {
                await runBatch("delete");
                setDeleteConfirmOpen(false);
              }}
            >
              {batchBusy ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
