"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { AnalysisResult } from "@/lib/product-analysis/types";
import { parseAsinInput } from "@/lib/asin-parser";
import { AnalysisAiReportSection } from "./analysis-ai-report-section";
import { AnalysisResultPanel } from "./analysis-result-panel";
import { cn } from "@/lib/utils";

type PreviewRow = {
  asin: string;
  ok: boolean;
  title?: string;
  image?: string;
  price?: number | null;
  error?: string;
};

type CacheMeta = {
  updatedAt: string;
  analystLabel: string;
};

export function ProductAnalysisWorkspace() {
  const searchParams = useSearchParams();
  const [loadingSaved, setLoadingSaved] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [rawInput, setRawInput] = useState("");
  const [purchaseCost, setPurchaseCost] = useState("8");
  const [firstMile, setFirstMile] = useState("1.5");
  const [fbaEstimate, setFbaEstimate] = useState("4.5");
  const [referralPct, setReferralPct] = useState("0.15");
  const [adPct, setAdPct] = useState("0.15");
  const [returnPct, setReturnPct] = useState("0.02");

  const [previewLoading, setPreviewLoading] = useState(false);
  const [parsedMeta, setParsedMeta] = useState<{
    marketplace: string;
    marketplaceLabel: string;
    warnings: string[];
  } | null>(null);
  const [previews, setPreviews] = useState<PreviewRow[]>([]);

  const [running, setRunning] = useState(false);
  const [progressLabel, setProgressLabel] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [cacheMeta, setCacheMeta] = useState<CacheMeta | undefined>();
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    const id = searchParams.get("id");
    const cacheId = searchParams.get("cacheId");

    if (id) {
      setLoadingSaved(true);
      setRunError(null);
      setFromCache(false);
      setCacheMeta(undefined);
      fetch(`/api/product-analysis/reports/${id}`)
        .then(async (res) => {
          const j = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(j.message ?? "加载失败");
          if (j.result) {
            setResult(j.result as AnalysisResult);
            setReportId(j.id as string);
            setProgressPct(100);
            setProgressLabel("已加载历史报告");
          }
        })
        .catch((e) => {
          setRunError(e instanceof Error ? e.message : "加载失败");
        })
        .finally(() => setLoadingSaved(false));
      return;
    }

    if (cacheId) {
      setLoadingSaved(true);
      setRunError(null);
      fetch(`/api/product-analysis/cache/${cacheId}`)
        .then(async (res) => {
          const j = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(j.message ?? "加载失败");
          if (j.result) {
            setResult(j.result as AnalysisResult);
            setReportId(null);
            setFromCache(true);
            setCacheMeta({
              updatedAt: j.updatedAt,
              analystLabel: j.analystLabel ?? "—",
            });
            setProgressPct(100);
            setProgressLabel(j.expired ? "缓存已过期（仅供查看）" : "已加载缓存快照");
          }
        })
        .catch((e) => {
          setRunError(e instanceof Error ? e.message : "加载失败");
        })
        .finally(() => setLoadingSaved(false));
      return;
    }

    setLoadingSaved(false);
  }, [searchParams]);

  const loadPreview = useCallback(async () => {
    const parsedLocal = parseAsinInput(rawInput);
    if (parsedLocal.asins.length === 0) {
      toast.error(
        "未识别到有效 ASIN。请每行输入一个 10 位 ASIN（以 B 开头），或包含 /dp/BXXXXXXXXX 的亚马逊商品链接。"
      );
      return;
    }

    setPreviewLoading(true);
    try {
      const res = await fetch("/api/product-analysis/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? "预览失败");
      setParsedMeta({
        marketplace: j.parsed?.marketplace ?? "US",
        marketplaceLabel: j.parsed?.marketplaceLabel ?? "",
        warnings: j.parsed?.warnings ?? [],
      });
      setPreviews(j.previews ?? []);
      if ((j.previews?.length ?? 0) === 0 && j.message) {
        toast.message(j.message);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "预览失败");
    } finally {
      setPreviewLoading(false);
    }
  }, [rawInput]);

  const runAnalysis = async (forceRefresh = false) => {
    const parsedLocal = parseAsinInput(rawInput);
    if (parsedLocal.asins.length === 0) {
      toast.error(
        "未识别到有效 ASIN。请每行输入一个 10 位 ASIN（以 B 开头），或包含 /dp/BXXXXXXXXX 的亚马逊商品链接。"
      );
      return;
    }

    setRunning(true);
    setResult(null);
    setReportId(null);
    setFromCache(false);
    setCacheMeta(undefined);
    setRunError(null);
    setProgressPct(0);
    setProgressLabel(forceRefresh ? "强制重新分析…" : "准备中…");

    try {
      const res = await fetch("/api/product-analysis/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawInput,
          purchaseCost: parseFloat(purchaseCost) || 0,
          firstMile: parseFloat(firstMile) || 0,
          fbaEstimate: parseFloat(fbaEstimate) || 0,
          referralPct: parseFloat(referralPct) || 0.15,
          adPct: parseFloat(adPct) || 0.15,
          returnPct: parseFloat(returnPct) || 0.02,
          forceRefresh,
        }),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("无法读取响应流");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as Record<string, unknown>;
          if (ev.type === "progress") {
            setProgressLabel(String(ev.label ?? ""));
            setProgressPct(Number(ev.percent ?? 0));
          } else if (ev.type === "error") {
            throw new Error(String(ev.message ?? "分析失败"));
          } else if (ev.type === "complete") {
            setResult(ev.result as AnalysisResult);
            const rid = ev.reportId;
            setReportId(
              rid != null && String(rid).length > 0 ? String(rid) : null
            );
            const fc = Boolean(ev.fromCache);
            setFromCache(fc);
            const cm = ev.cacheMeta as CacheMeta | undefined;
            setCacheMeta(
              fc && cm?.updatedAt && cm?.analystLabel ? cm : undefined
            );
            setProgressPct(100);
            setProgressLabel(fc ? "已加载缓存" : "完成");
            if (fc && cm?.analystLabel) {
              toast.success(
                `已使用分析缓存（由 ${cm.analystLabel} 生成，节省 Token）`
              );
            } else {
              toast.success("分析完成，已写入历史记录与缓存");
            }
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setRunError(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  };

  const downloadMarkdown = () => {
    if (!result) return;
    const blob = new Blob([result.ai.reportMarkdown], {
      type: "text/markdown;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `选品分析报告-${reportId ?? Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const printReport = () => {
    window.print();
  };

  const cacheBanner =
    fromCache && cacheMeta ? (
      <div className="rounded-xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
        <p className="font-medium">
          该产品已于{" "}
          {new Date(cacheMeta.updatedAt).toLocaleString("zh-CN", {
            dateStyle: "medium",
            timeStyle: "short",
          })}{" "}
          由 <span className="font-semibold">{cacheMeta.analystLabel}</span>{" "}
          分析过，正在显示{" "}
          <span className="font-semibold">3 个月内有效缓存</span>（未重复调用
          Claude / 卖家精灵）。
        </p>
        <p className="mt-1 text-xs text-amber-900/85">
          若采购价、头程或费率已变更，请调整左侧「利润假设」后重新分析；或点击下方「重新分析」强制刷新。
        </p>
      </div>
    ) : null;

  if (loadingSaved) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        <Loader2 className="size-8 animate-spin text-indigo-500" />
        加载中…
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1800px] flex-col gap-4">
      <div>
        <h2 className="font-heading text-xl font-semibold text-slate-900">选品分析</h2>
        <p className="mt-1 text-sm text-slate-600">
          输入竞品 ASIN 或链接；3 个月内相同产品将优先使用缓存，节省 Token。
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-slate-50/40 shadow-sm">
        <div className="flex min-h-[min(720px,85vh)] flex-col lg:flex-row">
        <aside
          className={cn(
            "relative flex flex-col border-b border-slate-200 bg-white transition-all duration-200 ease-out lg:min-h-0 lg:border-b-0 lg:border-r",
            sidebarCollapsed
              ? "lg:w-11 lg:max-w-none lg:shrink-0"
              : "lg:min-w-0 lg:flex-[1]"
          )}
        >
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="absolute -right-3 top-3 z-20 flex size-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md hover:bg-slate-50"
            aria-label={sidebarCollapsed ? "展开输入区" : "折叠输入区"}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </button>

          {!sidebarCollapsed && (
            <div className="flex max-h-[calc(100vh-8rem)] flex-col gap-4 overflow-y-auto p-3 pt-12">
              <Card className="border-slate-200/90 shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">1. 竞品输入</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    每行一个 ASIN 或商品链接；链接中的 ASIN 会自动从{" "}
                    <code className="rounded bg-slate-100 px-1">/dp/B…</code>{" "}
                    等路径识别。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <textarea
                    className="min-h-[140px] w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus-visible:border-indigo-400 focus-visible:ring-2 focus-visible:ring-indigo-500/20"
                    placeholder={
                      "每行一个ASIN或商品链接，例如：\nB0DFG12345\nhttps://www.amazon.com/dp/B0DFG12345"
                    }
                    value={rawInput}
                    onChange={(e) => setRawInput(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={previewLoading}
                      onClick={loadPreview}
                    >
                      {previewLoading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="size-4" />
                      )}
                      加载预览
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1.5"
                      disabled={running}
                      onClick={() => runAnalysis(false)}
                    >
                      {running ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Play className="size-4" />
                      )}
                      开始分析
                    </Button>
                  </div>

                  {parsedMeta && (
                    <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                      <span className="font-medium text-slate-800">站点：</span>
                      {parsedMeta.marketplaceLabel}（{parsedMeta.marketplace}）
                      {parsedMeta.warnings.map((w) => (
                        <p key={w} className="mt-1 text-amber-800">
                          {w}
                        </p>
                      ))}
                    </div>
                  )}

                  {previews.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-slate-700">商品预览</p>
                      <ul className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
                        {previews.map((p) => (
                          <li
                            key={p.asin}
                            className="flex gap-2 rounded-lg border border-slate-200/80 bg-white p-2 text-xs shadow-sm"
                          >
                            <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-slate-100">
                              {p.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={p.image}
                                  alt=""
                                  className="size-full object-cover"
                                />
                              ) : (
                                <span className="flex h-full items-center justify-center text-[10px] text-slate-400">
                                  无图
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-mono text-[11px] text-indigo-700">
                                {p.asin}
                              </p>
                              {p.ok ? (
                                <>
                                  <p className="line-clamp-2 text-slate-800">
                                    {p.title ?? "—"}
                                  </p>
                                  {p.price != null && (
                                    <p className="mt-0.5 font-medium text-slate-900">
                                      ${p.price.toFixed(2)}
                                      {p.price < 15 && (
                                        <Badge
                                          variant="destructive"
                                          className="ml-2 text-[10px]"
                                        >
                                          低价
                                        </Badge>
                                      )}
                                    </p>
                                  )}
                                </>
                              ) : (
                                <p className="text-red-600">{p.error}</p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-slate-200/90 shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">利润假设</CardTitle>
                  <CardDescription className="text-xs">
                    与缓存键绑定；修改后需重新分析才会匹配新缓存。
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-xs">采购成本 ($)</Label>
                    <Input
                      value={purchaseCost}
                      onChange={(e) => setPurchaseCost(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">头程 ($)</Label>
                    <Input value={firstMile} onChange={(e) => setFirstMile(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">FBA 估算 ($)</Label>
                    <Input
                      value={fbaEstimate}
                      onChange={(e) => setFbaEstimate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">佣金比例</Label>
                    <Input
                      value={referralPct}
                      onChange={(e) => setReferralPct(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">广告占比</Label>
                    <Input value={adPct} onChange={(e) => setAdPct(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">退货损耗占比</Label>
                    <Input
                      value={returnPct}
                      onChange={(e) => setReturnPct(e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {sidebarCollapsed && (
            <div className="flex flex-1 flex-col items-center justify-start pt-14 text-[10px] text-slate-500 [writing-mode:vertical-rl]">
              输入与利润
            </div>
          )}
        </aside>

        <main
          className={cn(
            "min-w-0 max-w-full overflow-x-hidden p-4 print:p-2",
            sidebarCollapsed ? "lg:flex-1" : "lg:min-w-0 lg:flex-[2]"
          )}
          style={{ overflowWrap: "break-word", wordBreak: "break-word" }}
        >
          {(running || progressPct > 0) && (
            <Card className="mb-4 border-indigo-200/60 bg-gradient-to-br from-indigo-50/50 to-white print:hidden">
              <CardContent className="pt-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-800">
                    {running ? "分析进行中…" : "进度"}
                  </span>
                  <span className="text-muted-foreground">{progressPct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-600">{progressLabel}</p>
              </CardContent>
            </Card>
          )}

          {runError && (
            <Card className="mb-4 border-red-200 bg-red-50/50 print:hidden">
              <CardContent className="py-3 text-sm text-red-800">{runError}</CardContent>
            </Card>
          )}

          {!result && !running && !runError && (
            <Card className="border-dashed border-slate-200 print:hidden">
              <CardContent className="break-words py-16 text-center text-sm text-muted-foreground">
                在左侧输入 ASIN 后点击「加载预览」或「开始分析」，结果将在此展示。
              </CardContent>
            </Card>
          )}

          {result && (
            <AnalysisResultPanel
              result={result}
              reportId={reportId}
              fromCache={fromCache}
              cacheBanner={cacheBanner}
              onReanalyze={() => runAnalysis(true)}
              reanalyzeLoading={running}
              onDownloadMarkdown={downloadMarkdown}
              onPrint={printReport}
            />
          )}
        </main>
        </div>

        {result && (
          <div className="border-t border-slate-200 bg-white px-3 py-6 sm:px-6">
            <AnalysisAiReportSection
              result={result}
              onFactorySpecUpdate={(factorySpecMarkdown) =>
                setResult((r) =>
                  r
                    ? {
                        ...r,
                        ai: { ...r.ai, factorySpecMarkdown },
                      }
                    : r
                )
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
