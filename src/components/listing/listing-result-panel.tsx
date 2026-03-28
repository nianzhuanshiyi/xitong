"use client";

import { useMemo, useState } from "react";
import {
  Copy,
  GripVertical,
  Loader2,
  RefreshCw,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  stripHtmlCharLength,
  utf8ByteLength,
} from "@/lib/listing/postprocess";
import type { ListingResultPayload } from "@/lib/listing/types";

function copyText(text: string, msg = "已复制") {
  void navigator.clipboard.writeText(text).then(
    () => toast.success(msg),
    () => toast.error("复制失败")
  );
}

type Props = {
  result: ListingResultPayload;
  setResult: React.Dispatch<React.SetStateAction<ListingResultPayload>>;
  primaryTitleIndex: number;
  setPrimaryTitleIndex: (i: number) => void;
  regenerating: string | null;
  onRegenerateBullet: (index: number) => void;
  onRegenerateDescription: () => void;
  onRegenerateSearchTerms: () => void;
  onRegenerateTitles: () => void;
  streamingPreview: string;
};

export function ListingResultPanel({
  result,
  setResult,
  primaryTitleIndex,
  setPrimaryTitleIndex,
  regenerating,
  onRegenerateBullet,
  onRegenerateDescription,
  onRegenerateSearchTerms,
  onRegenerateTitles,
  streamingPreview,
}: Props) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [descTab, setDescTab] = useState<"edit" | "preview">("edit");
  const [titleVer, setTitleVer] = useState("0");

  const titleLen = (i: number) => (result.titles[i] ?? "").length;
  const descPlainLen = useMemo(
    () => stripHtmlCharLength(result.productDescriptionHtml),
    [result.productDescriptionHtml]
  );
  const stBytes = utf8ByteLength(result.searchTerms);

  const moveBullet = (from: number, to: number) => {
    if (from === to) return;
    setResult((r) => {
      const b = [...r.bullets];
      const [x] = b.splice(from, 1);
      b.splice(to, 0, x);
      return { ...r, bullets: b };
    });
  };

  const setTitleAt = (i: number, v: string) => {
    setResult((r) => {
      const t: [string, string, string] = [...r.titles] as [
        string,
        string,
        string,
      ];
      t[i] = v;
      return { ...r, titles: t };
    });
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      {streamingPreview ? (
        <Card className="border-indigo-200 bg-indigo-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-indigo-900">
              AI 正在输出…
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-slate-700">
              {streamingPreview.slice(-8000)}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-base">标题 Title（≤200 字符）</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!!regenerating}
              onClick={onRegenerateTitles}
            >
              {regenerating === "titles" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              <span className="ml-1">重新生成三版</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={titleVer} onValueChange={setTitleVer}>
            <TabsList className="mb-3 w-full flex-wrap justify-start">
              {[0, 1, 2].map((i) => (
                <TabsTrigger key={i} value={String(i)}>
                  版本 {i + 1}{" "}
                  <span className="ml-1 text-muted-foreground">
                    ({titleLen(i)}/200)
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
            {[0, 1, 2].map((i) => (
              <TabsContent key={i} value={String(i)} className="space-y-2">
                <Input
                  value={result.titles[i]}
                  onChange={(e) => setTitleAt(i, e.target.value)}
                  className="text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={primaryTitleIndex === i ? "default" : "outline"}
                    onClick={() => {
                      setPrimaryTitleIndex(i);
                      toast.success(`已采用版本 ${i + 1} 为主标题`);
                    }}
                  >
                    {primaryTitleIndex === i ? (
                      <Check className="mr-1 size-3.5" />
                    ) : null}
                    采用
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => copyText(result.titles[i], "标题已复制")}
                  >
                    <Copy className="mr-1 size-3.5" />
                    复制
                  </Button>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-base">五点描述（每条 ≤500 字符）</CardTitle>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              copyText(result.bullets.join("\n\n"), "五点已复制")
            }
          >
            <Copy className="mr-1 size-3.5" />
            复制全部
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {result.bullets.map((b, i) => (
            <div
              key={i}
              className={cn(
                "rounded-lg border border-slate-200 p-3",
                dragFrom === i && "opacity-60"
              )}
              draggable
              onDragStart={() => setDragFrom(i)}
              onDragEnd={() => setDragFrom(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragFrom != null) moveBullet(dragFrom, i);
                setDragFrom(null);
              }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <GripVertical className="size-4 cursor-grab text-slate-400" />
                  第 {i + 1} 条（{b.length}/500）
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!!regenerating}
                  onClick={() => onRegenerateBullet(i)}
                >
                  {regenerating === `bullet-${i}` ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  <span className="ml-1">重生成此条</span>
                </Button>
              </div>
              <textarea
                className="min-h-[72px] w-full rounded-md border border-input bg-white px-2 py-1.5 text-sm"
                value={b}
                onChange={(e) =>
                  setResult((r) => {
                    const bullets = [...r.bullets];
                    bullets[i] = e.target.value;
                    return { ...r, bullets };
                  })
                }
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-base">
            产品描述（纯文本约 {descPlainLen}/2000 字符）
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!!regenerating}
              onClick={onRegenerateDescription}
            >
              {regenerating === "desc" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              <span className="ml-1">重新生成</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                copyText(
                  result.productDescriptionHtml.replace(/<[^>]+>/g, ""),
                  "已复制纯文本"
                )
              }
            >
              复制纯文本
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                copyText(result.productDescriptionHtml, "已复制 HTML")
              }
            >
              复制 HTML
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <Tabs
            value={descTab}
            onValueChange={(v) => setDescTab(v as "edit" | "preview")}
          >
            <TabsList>
              <TabsTrigger value="edit">编辑</TabsTrigger>
              <TabsTrigger value="preview">预览</TabsTrigger>
            </TabsList>
            <TabsContent value="edit">
              <textarea
                className="min-h-[200px] w-full rounded-md border border-input bg-white px-2 py-1.5 font-mono text-xs"
                value={result.productDescriptionHtml}
                onChange={(e) =>
                  setResult((r) => ({
                    ...r,
                    productDescriptionHtml: e.target.value,
                  }))
                }
              />
            </TabsContent>
            <TabsContent value="preview">
              <div
                className="prose prose-sm max-w-none rounded-md border border-slate-100 bg-white p-4"
                dangerouslySetInnerHTML={{
                  __html: result.productDescriptionHtml || "<p>（空）</p>",
                }}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-base">
            后台搜索词（{stBytes}/249 字节 UTF-8）
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!!regenerating}
              onClick={onRegenerateSearchTerms}
            >
              {regenerating === "st" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              <span className="ml-1">重新生成</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => copyText(result.searchTerms, "搜索词已复制")}
            >
              <Copy className="mr-1 size-3.5" />
              复制
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <textarea
            className="min-h-[80px] w-full rounded-md border border-input bg-white px-2 py-1.5 text-sm"
            value={result.searchTerms}
            onChange={(e) =>
              setResult((r) => ({ ...r, searchTerms: e.target.value }))
            }
          />
          <p className="mt-1 text-xs text-muted-foreground">
            生成时已尝试去重、去掉品牌与主标题词；可按需再编辑。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">A+ 文案建议</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(
            [
              ["brandStory", "品牌故事"],
              ["comparison", "产品对比图文案"],
              ["scenarios", "使用场景文案"],
              ["faq", "FAQ 文案"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium">{label}</span>
                <button
                  type="button"
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "sm" }),
                    "h-7"
                  )}
                  onClick={() =>
                    copyText(result.aplus[key], `${label} 已复制`)
                  }
                >
                  <Copy className="size-3.5" />
                </button>
              </div>
              <textarea
                className="min-h-[72px] w-full rounded-md border border-input bg-white px-2 py-1.5 text-sm"
                value={result.aplus[key]}
                onChange={(e) =>
                  setResult((r) => ({
                    ...r,
                    aplus: { ...r.aplus, [key]: e.target.value },
                  }))
                }
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
