"use client";

import { useState } from "react";
import { Loader2, Paperclip, Reply, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMailContext } from "./mail-context";
import { EmailTagInput } from "./email-tag-input";

export function MailComposer() {
  const ctx = useMailContext();

  if (!ctx.detail) return null;

  return (
    <div className="border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
      <input
        ref={ctx.replyFileInputRef as React.RefObject<HTMLInputElement>}
        type="file"
        multiple
        className="hidden"
        onChange={(ev) => {
          const list = ev.target.files;
          if (!list?.length) return;
          ctx.setReplyFiles((prev) => [...prev, ...Array.from(list)]);
          ev.target.value = "";
        }}
      />

      {!ctx.replyEditorOpen ? (
        <div className="flex gap-2">
          <Input
            placeholder="用中文写大意，或点「回复」展开完整编辑区…"
            className="h-9 flex-1 text-sm"
            value={ctx.replyZh}
            onChange={(e) => ctx.setReplyZh(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ctx.replyZh.trim()) {
                ctx.setReplyEditorOpen(true);
              }
            }}
          />
          <Button
            type="button"
            className="h-9 shrink-0 gap-1.5 px-4"
            onClick={() => ctx.setReplyEditorOpen(true)}
          >
            <Reply className="size-3.5" />
            回复
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Recipient fields */}
          <ReplyRecipients />
          <textarea
            className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed"
            placeholder="用中文写回复大意（不必很正式）…"
            value={ctx.replyZh}
            onChange={(e) => ctx.setReplyZh(e.target.value)}
          />
          {ctx.replyFiles.length > 0 && (
            <ul className="flex flex-wrap gap-2 text-[11px] text-slate-600">
              {ctx.replyFiles.map((f, i) => (
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
                      ctx.setReplyFiles((prev) => prev.filter((_, j) => j !== i))
                    }
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => ctx.replyFileInputRef.current?.click()}
            >
              添加附件
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void ctx.polishReplyAndOpenPreview()}
              disabled={!ctx.replyZh.trim() || ctx.previewBusy}
            >
              {ctx.previewBusy ? (
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
                ctx.setReplyEditorOpen(false);
                ctx.setReplyFiles([]);
              }}
            >
              收起
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReplyRecipients() {
  const ctx = useMailContext();
  const [showCc, setShowCc] = useState(ctx.replyCc.length > 0);
  const [showBcc, setShowBcc] = useState(ctx.replyBcc.length > 0);

  return (
    <div className="space-y-1.5 rounded-md border border-slate-200 bg-slate-50/80 p-2">
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-[11px] text-slate-500">收件人</Label>
          <div className="flex gap-2 text-[10px]">
            {!showCc && (
              <button type="button" className="text-indigo-600 hover:underline" onClick={() => setShowCc(true)}>
                +CC
              </button>
            )}
            {!showBcc && (
              <button type="button" className="text-indigo-600 hover:underline" onClick={() => setShowBcc(true)}>
                +BCC
              </button>
            )}
          </div>
        </div>
        <EmailTagInput value={ctx.replyTo} onChange={ctx.setReplyTo} placeholder="输入邮箱后回车" className="mt-0.5 bg-white" />
      </div>
      {showCc && (
        <div>
          <Label className="text-[11px] text-slate-500">抄送 (CC)</Label>
          <EmailTagInput value={ctx.replyCc} onChange={ctx.setReplyCc} placeholder="输入邮箱后回车" className="mt-0.5 bg-white" />
        </div>
      )}
      {showBcc && (
        <div>
          <Label className="text-[11px] text-slate-500">密送 (BCC)</Label>
          <EmailTagInput value={ctx.replyBcc} onChange={ctx.setReplyBcc} placeholder="输入邮箱后回车" className="mt-0.5 bg-white" />
        </div>
      )}
    </div>
  );
}
