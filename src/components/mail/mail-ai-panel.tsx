"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMailContext } from "./mail-context";

export function MailAIPanel() {
  const ctx = useMailContext();

  return (
    <Sheet open={ctx.aiOpen} onOpenChange={ctx.setAiOpen}>
      <SheetContent
        side="right"
        className="flex w-full max-w-[min(100vw,360px)] flex-col sm:max-w-[320px]"
      >
        <SheetHeader>
          <SheetTitle>AI 助手</SheetTitle>
        </SheetHeader>
        <Tabs
          value={ctx.aiTab}
          onValueChange={ctx.setAiTab}
          className="mt-4 flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="grid h-auto shrink-0 grid-cols-2 gap-1">
            <TabsTrigger value="translate" className="text-[10px]">
              翻译
            </TabsTrigger>
            <TabsTrigger value="decision" className="text-[10px]">
              采购建议
            </TabsTrigger>
            <TabsTrigger value="asin" className="text-[10px]">
              ASIN
            </TabsTrigger>
            <TabsTrigger value="free" className="text-[10px]">
              提问
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="translate"
            className="mt-3 flex min-h-0 flex-1 flex-col space-y-2"
          >
            <textarea
              className="min-h-[120px] w-full rounded-md border p-2 text-sm"
              placeholder="输入文本…"
              value={ctx.aiTranslateIn}
              onChange={(e) => ctx.setAiTranslateIn(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              onClick={() => void ctx.runAiTranslate()}
            >
              翻译
            </Button>
            <pre className="min-h-[80px] flex-1 whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-xs">
              {ctx.aiTranslateOut}
            </pre>
          </TabsContent>

          <TabsContent value="decision" className="mt-3 space-y-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void ctx.runAiDecision()}
            >
              基于当前邮件生成建议
            </Button>
            <pre className="max-h-[60vh] whitespace-pre-wrap text-xs">
              {ctx.aiDecisionOut}
            </pre>
          </TabsContent>

          <TabsContent value="asin" className="mt-3 space-y-2">
            <Input
              placeholder="输入 ASIN"
              value={ctx.asinQ}
              onChange={(e) => ctx.setAsinQ(e.target.value)}
            />
            <p className="text-xs text-slate-500">
              卖家精灵数据对接可在后续接入；此处预留快捷入口。
            </p>
          </TabsContent>

          <TabsContent value="free" className="mt-3 space-y-2">
            <textarea
              className="min-h-[100px] w-full rounded-md border p-2 text-sm"
              value={ctx.freeQ}
              onChange={(e) => ctx.setFreeQ(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                const r = await fetch("/api/mail/translate", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    text: ctx.freeQ,
                    hint: ctx.detail
                      ? `上下文邮件主题：${ctx.detail.subject}`
                      : undefined,
                  }),
                });
                const j = await r.json().catch(() => ({}));
                ctx.setAiTranslateOut(
                  (j as { text?: string }).text ?? ""
                );
              }}
            >
              发送给 AI
            </Button>
            <pre className="text-xs text-slate-600">{ctx.aiTranslateOut}</pre>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
