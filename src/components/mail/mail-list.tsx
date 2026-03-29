"use client";

import { Loader2, Paperclip, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useMailContext, formatMailTime } from "./mail-context";

export function MailList() {
  const ctx = useMailContext();

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50/50">
      <div className="border-b border-slate-100 p-2">
        <Input
          placeholder="搜索当前列表…"
          className="h-8 text-xs"
          value={ctx.qMid}
          onChange={(e) => ctx.setQMid(e.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {ctx.loadingList ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-6 animate-spin text-indigo-500" />
          </div>
        ) : ctx.threads.length === 0 ? (
          <p className="p-4 text-center text-xs text-slate-500">暂无邮件</p>
        ) : (
          ctx.threads.map((t) => {
            const isActive = ctx.emailId === t.threadId;
            const isUnread = !t.latest.isRead;
            return (
              <button
                key={t.threadId}
                type="button"
                onClick={() => {
                  ctx.setEmailId(t.threadId);
                  if (ctx.narrow) ctx.setMobileStep(2);
                }}
                className={cn(
                  "group relative w-full border-b border-slate-100 px-3 py-2.5 text-left text-xs transition",
                  isActive
                    ? "bg-white ring-1 ring-inset ring-indigo-200"
                    : "hover:bg-white",
                  isUnread && "bg-blue-50/60"
                )}
              >
                {/* Priority color bar - priority only available on detail, show neutral for list */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l bg-blue-500"
                />

                <div className="flex items-center gap-1 pl-1 text-[10px] text-slate-500">
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
                    "mt-0.5 line-clamp-2 pl-1 text-sm",
                    isUnread ? "font-semibold text-slate-900" : "text-slate-700"
                  )}
                >
                  {t.latest.subject}
                </div>

                {t.latest.summaryCn && (
                  <div className="mt-0.5 line-clamp-1 pl-1 text-[10px] text-slate-500">
                    {t.latest.summaryCn}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
