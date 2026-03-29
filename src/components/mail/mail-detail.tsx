"use client";

import { useState } from "react";
import {
  Archive,
  Bot,
  ChevronDown,
  ChevronUp,
  Forward,
  Loader2,
  MailOpen,
  Reply,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useMailContext, priLabelFor, priColorClass, msgSnippetText } from "./mail-context";
import { MailComposer } from "./mail-composer";

export function MailDetail() {
  const ctx = useMailContext();
  const [aiCardOpen, setAiCardOpen] = useState(true);

  if (!ctx.detail) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        选择一封邮件查看详情
      </div>
    );
  }

  if (ctx.loadingDetail) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const { detail, threadMessages } = ctx;

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col bg-white">
      {/* Header */}
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
          {threadMessages.length > 1 && (
            <span className="ml-2 text-slate-500">
              · 本对话共 {threadMessages.length} 封
            </span>
          )}
        </p>

        {/* Action buttons */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1 px-2.5 text-xs"
            disabled={ctx.mailActionBusy}
            onClick={() => ctx.setReplyEditorOpen(true)}
          >
            <Reply className="size-3.5" />
            回复
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1 px-2.5 text-xs"
            disabled={ctx.mailActionBusy}
            onClick={() => ctx.setForwardOpen(true)}
          >
            <Forward className="size-3.5" />
            转发
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1 px-2.5 text-xs text-red-700 hover:bg-red-50"
            disabled={ctx.mailActionBusy}
            onClick={() => ctx.setDeleteOpen(true)}
          >
            <Trash2 className="size-3.5" />
            删除
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1 px-2.5 text-xs"
            disabled={ctx.mailActionBusy}
            onClick={() => void ctx.patchDetailFlags({ isStarred: !detail.isStarred })}
          >
            <Star
              className={cn(
                "size-3.5",
                detail.isStarred && "fill-amber-400 text-amber-500"
              )}
            />
            星标
          </Button>
          {!detail.supplierId && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 gap-1 px-2.5 text-xs"
              onClick={() => void ctx.openClassify()}
            >
              归入供应商
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1 px-2.5 text-xs"
            disabled={ctx.mailActionBusy}
            onClick={() => void ctx.patchDetailFlags({ isRead: !detail.isRead })}
          >
            <MailOpen className="size-3.5" />
            {detail.isRead ? "标为未读" : "标为已读"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1 px-2.5 text-xs"
            disabled={ctx.mailActionBusy}
            onClick={() => void ctx.patchDetailFlags({ isArchived: true })}
          >
            <Archive className="size-3.5" />
            归档
          </Button>
        </div>
      </div>

      {/* Thread messages */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-48 pt-4">
        {threadMessages.length > 0 && (
          <div className="space-y-3">
            {threadMessages.map((m, idx) => {
              const isLatest = idx === threadMessages.length - 1;
              const isOpen = isLatest || ctx.expandedMsgIds.has(m.id);
              const enOpen = ctx.bodyEnOpenById[m.id] ?? false;

              if (!isOpen) {
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      ctx.setExpandedMsgIds((prev) => {
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
                  {!isLatest && (
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/50 px-3 py-2">
                      <span className="truncate text-xs text-slate-600">
                        {m.fromAddress} ·{" "}
                        {new Date(m.receivedAt).toLocaleString("zh-CN")}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-[10px] font-medium text-indigo-600 hover:underline"
                        onClick={() =>
                          ctx.setExpandedMsgIds((prev) => {
                            const n = new Set(prev);
                            n.delete(m.id);
                            return n;
                          })
                        }
                      >
                        收起
                      </button>
                    </div>
                  )}

                  <div className="p-3">
                    {/* Collapsible AI analysis card */}
                    <div className="rounded-xl border border-violet-200/90 bg-violet-50/70 shadow-none">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2.5"
                        onClick={() => setAiCardOpen((v) => !v)}
                      >
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-violet-950">
                          <Sparkles className="size-3.5 text-violet-600" />
                          AI 分析
                          <span
                            className={cn(
                              "inline-block size-2 rounded-full",
                              priColorClass(m.priority)
                            )}
                            title={priLabelFor(m)}
                          />
                        </span>
                        {aiCardOpen ? (
                          <ChevronUp className="size-4 text-violet-400" />
                        ) : (
                          <ChevronDown className="size-4 text-violet-400" />
                        )}
                      </button>

                      {aiCardOpen && (
                        <div className="border-t border-violet-200/60 px-3 pb-3 pt-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[11px] font-medium text-violet-900">
                              中文摘要
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-6 gap-1 text-[10px]"
                              disabled={ctx.regenTargetId !== null}
                              onClick={() => void ctx.regenerateSummaryFor(m.id)}
                            >
                              {ctx.regenTargetId === m.id ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Sparkles className="size-3" />
                              )}
                              重新生成
                            </Button>
                          </div>
                          <p className="mt-1 text-sm leading-relaxed text-slate-800">
                            {m.summaryCn?.trim() || "暂无摘要"}
                          </p>

                          {m.actionItems?.length ? (
                            <div className="mt-3 border-t border-violet-200/60 pt-2">
                              <p className="text-[11px] font-medium text-violet-900">
                                待办事项
                              </p>
                              <ul className="mt-1.5 space-y-1">
                                {m.actionItems.map((a) => (
                                  <li key={a.id} className="flex items-center gap-2 text-xs">
                                    <input
                                      type="checkbox"
                                      checked={a.isCompleted}
                                      onChange={(ev) =>
                                        void ctx.toggleTodo(a.id, ev.target.checked)
                                      }
                                      className="rounded border-slate-300"
                                    />
                                    <span
                                      className={cn(
                                        a.isCompleted && "text-slate-400 line-through"
                                      )}
                                    >
                                      {a.content}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <p className="mt-2 text-[11px] text-slate-500">暂无待办</p>
                          )}

                          <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-medium text-violet-900">
                              标签
                            </span>
                            {(() => {
                              try {
                                const t = JSON.parse(m.tagsJson || "[]") as string[];
                                if (!t.length) {
                                  return (
                                    <span className="text-[11px] text-slate-500">暂无</span>
                                  );
                                }
                                return t.map((x) => (
                                  <Badge key={x} variant="secondary" className="text-[10px]">
                                    {x}
                                  </Badge>
                                ));
                              } catch {
                                return (
                                  <span className="text-[11px] text-slate-500">暂无</span>
                                );
                              }
                            })()}
                          </div>

                          <p className="mt-2 text-[11px] text-slate-700">
                            <span className="font-medium">紧急程度</span>：{priLabelFor(m)}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Body - default Chinese translation */}
                    <div className="mt-4">
                      <p className="text-xs font-medium text-slate-600">正文（中文翻译）</p>
                      <div className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-3 text-sm leading-[1.6] text-slate-800">
                        {m.bodyZh?.trim() ||
                          m.summaryCn?.trim() ||
                          "暂无中文全文翻译，可点击「重新生成」。"}
                      </div>
                      <button
                        type="button"
                        className="mt-2 text-xs font-medium text-indigo-600 hover:underline"
                        onClick={() =>
                          ctx.setBodyEnOpenById((prev) => ({
                            ...prev,
                            [m.id]: !enOpen,
                          }))
                        }
                      >
                        {enOpen ? "收起英文原文 ▲" : "查看英文原文 ▼"}
                      </button>
                      {enOpen && (
                        <div className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm leading-[1.6] text-slate-700">
                          {m.bodyText}
                        </div>
                      )}
                    </div>

                    {/* Attachments */}
                    {m.attachments?.length ? (
                      <div className="mt-4">
                        <p className="text-xs font-medium text-slate-600">附件</p>
                        <ul className="mt-1 space-y-1">
                          {m.attachments.map((a) => (
                            <li key={a.id}>
                              <a
                                href={`/${a.storagePath.replace(/^\/+/, "")}`}
                                className="text-xs text-indigo-600 hover:underline"
                                target="_blank"
                                rel="noreferrer"
                              >
                                {a.filename} ({Math.round(a.sizeBytes / 1024)} KB)
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

      {/* Persistent reply box at bottom */}
      <MailComposer />

      {/* AI assistant FAB */}
      <Button
        type="button"
        size="icon"
        className="absolute bottom-28 right-4 size-10 rounded-full shadow-lg"
        onClick={() => ctx.setAiOpen(true)}
        title="AI 助手"
      >
        <Bot className="size-5" />
      </Button>
    </div>
  );
}
