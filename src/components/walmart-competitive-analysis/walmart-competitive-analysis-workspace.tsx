"use client";

import { useCallback, useMemo, useState } from "react";
import { Download, Eye, Loader2, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type SalesModelConfig = {
  reviewWeight: number;
  recent30dWeight: number;
  lowRangeFactor: number;
  highRangeFactor: number;
  rankMultiplierHigh: number;
  rankMultiplierMedium: number;
  rankMultiplierLow: number;
};

type AnalysisReport = {
  monthlySalesRange: [number, number];
  monthlyRevenueRange: [number | null, number | null];
  confidence: "low" | "medium" | "high";
  evidence: string[];
  risks: string[];
  modelDetail: {
    reviewCount: number;
    recent30dReviewCount: number;
    rankedKeywordsTop20: number;
    reviewDrivenBase: number;
    recentDrivenBase: number;
    rankMultiplier: number;
  };
};

type AnalysisData = {
  product: {
    productId: string;
    name: string;
    brand: string;
    category: string;
    price: number | null;
    rating: number | null;
    reviewCount: number | null;
    sellerName: string;
  };
  rankings: Array<{
    keyword: string;
    rank: number | null;
    totalResults: number | null;
  }>;
  trend: {
    recent30dReviewCount: number;
    recent90dReviewCount: number;
    trendDirection: "up" | "flat" | "down";
  };
  modelConfig: SalesModelConfig;
};

type RunResponse = {
  analysisId: string;
  fromCache?: boolean;
  report: AnalysisReport;
  data: AnalysisData;
};

type HistoryItem = {
  id: string;
  competitorUrl: string;
  productId: string;
  productName: string | null;
  status: string;
  errorMessage: string | null;
  report: {
    estimate?: AnalysisReport;
    modelConfig?: SalesModelConfig;
  } | null;
  createdAt: string;
};

type LegacyEstimate = Partial<AnalysisReport> & {
  monthlySalesLow?: number;
  monthlySalesHigh?: number;
  monthlyRevenueLow?: number | null;
  monthlyRevenueHigh?: number | null;
};

const MODEL_TEMPLATES: Array<{ key: string; label: string; config: SalesModelConfig }> = [
  {
    key: "default",
    label: "通用模板",
    config: {
      reviewWeight: 0.12,
      recent30dWeight: 8,
      lowRangeFactor: 0.8,
      highRangeFactor: 1.3,
      rankMultiplierHigh: 1.4,
      rankMultiplierMedium: 1.15,
      rankMultiplierLow: 0.85,
    },
  },
  {
    key: "beauty",
    label: "美妆个护",
    config: {
      reviewWeight: 0.1,
      recent30dWeight: 9,
      lowRangeFactor: 0.75,
      highRangeFactor: 1.35,
      rankMultiplierHigh: 1.45,
      rankMultiplierMedium: 1.2,
      rankMultiplierLow: 0.85,
    },
  },
  {
    key: "electronics",
    label: "3C电子",
    config: {
      reviewWeight: 0.14,
      recent30dWeight: 7,
      lowRangeFactor: 0.82,
      highRangeFactor: 1.25,
      rankMultiplierHigh: 1.35,
      rankMultiplierMedium: 1.12,
      rankMultiplierLow: 0.8,
    },
  },
];

function confidenceLabel(v: AnalysisReport["confidence"]) {
  if (v === "high") return "高";
  if (v === "medium") return "中";
  return "低";
}

function trendLabel(v: "up" | "flat" | "down") {
  if (v === "up") return "上升";
  if (v === "down") return "下降";
  return "平稳";
}

function toRange(
  range: unknown,
  low: unknown,
  high: unknown
): [number, number] | null {
  if (
    Array.isArray(range) &&
    range.length >= 2 &&
    Number.isFinite(Number(range[0])) &&
    Number.isFinite(Number(range[1]))
  ) {
    return [Number(range[0]), Number(range[1])];
  }
  if (Number.isFinite(Number(low)) && Number.isFinite(Number(high))) {
    return [Number(low), Number(high)];
  }
  return null;
}

function toFiniteNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 售价缺失时 API 可能返回 null，不得当作 0 */
function toRevenueRange(
  range: unknown,
  low: unknown,
  high: unknown
): [number, number] | null {
  if (Array.isArray(range) && range.length >= 2) {
    const a = toFiniteNumber(range[0]);
    const b = toFiniteNumber(range[1]);
    if (a != null && b != null) return [a, b];
  }
  const nl = toFiniteNumber(low);
  const nh = toFiniteNumber(high);
  if (nl != null && nh != null) return [nl, nh];
  return null;
}

function normalizeEstimate(estimate?: LegacyEstimate): {
  salesRange: [number, number] | null;
  revenueRange: [number, number] | null;
  confidence: "low" | "medium" | "high";
  evidence: string[];
  risks: string[];
} {
  const salesRange = toRange(
    estimate?.monthlySalesRange,
    estimate?.monthlySalesLow,
    estimate?.monthlySalesHigh
  );
  const revenueRange = toRevenueRange(
    estimate?.monthlyRevenueRange,
    estimate?.monthlyRevenueLow,
    estimate?.monthlyRevenueHigh
  );
  return {
    salesRange,
    revenueRange,
    confidence:
      estimate?.confidence === "high" || estimate?.confidence === "medium"
        ? estimate.confidence
        : "low",
    evidence: Array.isArray(estimate?.evidence) ? estimate.evidence : [],
    risks: Array.isArray(estimate?.risks) ? estimate.risks : [],
  };
}

export function WalmartCompetitiveAnalysisWorkspace() {
  const [competitorUrl, setCompetitorUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeTemplate, setActiveTemplate] = useState("default");
  const [detailItem, setDetailItem] = useState<HistoryItem | null>(null);
  const [modelConfig, setModelConfig] = useState<SalesModelConfig>({
    reviewWeight: 0.12,
    recent30dWeight: 8,
    lowRangeFactor: 0.8,
    highRangeFactor: 1.3,
    rankMultiplierHigh: 1.4,
    rankMultiplierMedium: 1.15,
    rankMultiplierLow: 0.85,
  });

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/walmart/competitive-analysis", { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { items?: HistoryItem[]; message?: string };
      if (!res.ok) throw new Error(j.message ?? "历史记录加载失败");
      setHistory(Array.isArray(j.items) ? j.items : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "历史记录加载失败");
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const runAnalysis = useCallback(async (forceRefresh = false) => {
    if (!competitorUrl.trim()) {
      toast.error("请先输入沃尔玛竞品链接");
      return;
    }
    setRunning(true);
    try {
      const res = await fetch("/api/walmart/competitive-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competitorUrl: competitorUrl.trim(),
          forceRefresh,
          modelConfig,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as RunResponse & { message?: string };
      if (!res.ok) throw new Error(j.message ?? "分析失败");
      setResult(j);
      setModelConfig(j.data.modelConfig);
      toast.success(j.fromCache ? "分析完成（命中缓存）" : "竞品分析完成");
      loadHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "分析失败");
    } finally {
      setRunning(false);
    }
  }, [competitorUrl, loadHistory, modelConfig]);

  const topRankings = useMemo(
    () => (result?.data.rankings ?? []).slice().sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999)).slice(0, 8),
    [result]
  );

  const downloadFile = useCallback((filename: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  const exportHistoryJson = useCallback(() => {
    if (!detailItem) return;
    const filename = `walmart-analysis-${detailItem.productId}-${detailItem.id}.json`;
    const content = JSON.stringify(detailItem, null, 2);
    downloadFile(filename, content, "application/json;charset=utf-8");
  }, [detailItem, downloadFile]);

  const exportHistoryMarkdown = useCallback(() => {
    if (!detailItem) return;
    const estimate = normalizeEstimate(detailItem.report?.estimate);
    const model = detailItem.report?.modelConfig;
    const md = [
      `# 沃尔玛竞品分析记录`,
      ``,
      `- 记录ID: ${detailItem.id}`,
      `- 商品ID: ${detailItem.productId}`,
      `- 商品名: ${detailItem.productName ?? "-"}`,
      `- 链接: ${detailItem.competitorUrl}`,
      `- 状态: ${detailItem.status}`,
      `- 时间: ${new Date(detailItem.createdAt).toLocaleString("zh-CN")}`,
      ``,
      `## 估算结果`,
      estimate.salesRange
        ? [
            `- 月销量区间: ${estimate.salesRange[0]} - ${estimate.salesRange[1]}`,
            estimate.revenueRange
              ? `- 月销售额区间: $${estimate.revenueRange[0]} - $${estimate.revenueRange[1]}`
              : `- 月销售额区间: 未获取有效售价，无法换算`,
            `- 置信度: ${confidenceLabel(estimate.confidence)}`,
          ].join("\n")
        : `- 无`,
      ``,
      `## 模型参数`,
      model
        ? `- reviewWeight: ${model.reviewWeight}\n- recent30dWeight: ${model.recent30dWeight}\n- lowRangeFactor: ${model.lowRangeFactor}\n- highRangeFactor: ${model.highRangeFactor}\n- rankMultiplierHigh: ${model.rankMultiplierHigh}\n- rankMultiplierMedium: ${model.rankMultiplierMedium}\n- rankMultiplierLow: ${model.rankMultiplierLow}`
        : `- 无`,
      ``,
      `## 依据`,
      ...(estimate.evidence.length ? estimate.evidence.map((x) => `- ${x}`) : ["- 无"]),
      ``,
      `## 风险`,
      ...(estimate.risks.length ? estimate.risks.map((x) => `- ${x}`) : ["- 暂无"]),
      ``,
    ].join("\n");
    const filename = `walmart-analysis-${detailItem.productId}-${detailItem.id}.md`;
    downloadFile(filename, md, "text/markdown;charset=utf-8");
  }, [detailItem, downloadFile]);

  const applyTemplate = useCallback((templateKey: string) => {
    const hit = MODEL_TEMPLATES.find((x) => x.key === templateKey);
    if (!hit) return;
    setModelConfig(hit.config);
    setActiveTemplate(templateKey);
  }, []);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>沃尔玛竞品分析</CardTitle>
          <CardDescription>输入竞品链接，自动采集商品、关键词排名、评论并生成销量估算。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            className="rounded-lg border border-slate-200/90 bg-slate-50/80 px-3 py-2.5 text-xs leading-relaxed text-slate-600"
            role="note"
            aria-label="业务说明"
          >
            <p className="font-medium text-slate-800">业务逻辑说明</p>
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 marker:text-slate-400">
              <li>解析沃尔玛商品链接得到 productId，经 SearchAPI 拉取商品详情（标题、类目、价、评分、评论数等）。</li>
              <li>由标题/类目等生成若干关键词，再经沃尔玛搜索接口在自然结果中定位本品排名。</li>
              <li>分页拉取评论样本，统计近 30 天评论量与简单月趋势，用于热度判断。</li>
              <li>结合评论基数、近期评论、关键词命中档位与下方「模型参数」，估算月销量/销售额区间，并输出置信度、依据与风险。</li>
              <li>
                相同链接且模型参数一致时，在缓存有效期内直接复用结果、减少 SearchAPI 调用；点「强制刷新」会跳过缓存重新采集。
              </li>
            </ol>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="https://www.walmart.com/ip/xxx/123456789"
              value={competitorUrl}
              onChange={(e) => setCompetitorUrl(e.target.value)}
            />
            <Button onClick={() => runAnalysis(false)} disabled={running} className="gap-1.5">
              {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              开始分析
            </Button>
            <Button variant="outline" onClick={() => runAnalysis(true)} disabled={running} className="gap-1.5">
              强制刷新
            </Button>
            <Button variant="outline" onClick={loadHistory} disabled={loadingHistory} className="gap-1.5">
              {loadingHistory ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              刷新历史
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">评论权重</Label>
              <Input
                value={modelConfig.reviewWeight}
                onChange={(e) => {
                  setModelConfig((s) => ({ ...s, reviewWeight: Number(e.target.value) || s.reviewWeight }));
                  setActiveTemplate("custom");
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">近30天评论权重</Label>
              <Input
                value={modelConfig.recent30dWeight}
                onChange={(e) => {
                  setModelConfig((s) => ({ ...s, recent30dWeight: Number(e.target.value) || s.recent30dWeight }));
                  setActiveTemplate("custom");
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">低位区间系数</Label>
              <Input
                value={modelConfig.lowRangeFactor}
                onChange={(e) => {
                  setModelConfig((s) => ({ ...s, lowRangeFactor: Number(e.target.value) || s.lowRangeFactor }));
                  setActiveTemplate("custom");
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">高位区间系数</Label>
              <Input
                value={modelConfig.highRangeFactor}
                onChange={(e) => {
                  setModelConfig((s) => ({ ...s, highRangeFactor: Number(e.target.value) || s.highRangeFactor }));
                  setActiveTemplate("custom");
                }}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {MODEL_TEMPLATES.map((tpl) => (
              <Button
                key={tpl.key}
                type="button"
                variant={activeTemplate === tpl.key ? "default" : "outline"}
                size="sm"
                onClick={() => applyTemplate(tpl.key)}
              >
                {tpl.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
      <Dialog open={Boolean(detailItem)} onOpenChange={(open) => !open && setDetailItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detailItem?.productName || detailItem?.productId || "历史详情"}</DialogTitle>
            <DialogDescription className="truncate">{detailItem?.competitorUrl}</DialogDescription>
          </DialogHeader>
          {detailItem ? (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={exportHistoryMarkdown} className="gap-1.5">
                  <Download className="size-4" />
                  导出 Markdown
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={exportHistoryJson} className="gap-1.5">
                  <Download className="size-4" />
                  导出 JSON
                </Button>
              </div>
              <div className="rounded-lg border p-3">
                <p className="mb-2 font-medium">模型参数</p>
                {detailItem.report?.modelConfig ? (
                  <div className="grid gap-1 text-xs sm:grid-cols-2">
                    <p>reviewWeight: {detailItem.report.modelConfig.reviewWeight}</p>
                    <p>recent30dWeight: {detailItem.report.modelConfig.recent30dWeight}</p>
                    <p>lowRangeFactor: {detailItem.report.modelConfig.lowRangeFactor}</p>
                    <p>highRangeFactor: {detailItem.report.modelConfig.highRangeFactor}</p>
                    <p>rankMultiplierHigh: {detailItem.report.modelConfig.rankMultiplierHigh}</p>
                    <p>rankMultiplierMedium: {detailItem.report.modelConfig.rankMultiplierMedium}</p>
                    <p>rankMultiplierLow: {detailItem.report.modelConfig.rankMultiplierLow}</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">该记录未保存模型参数</p>
                )}
              </div>
              <div className="rounded-lg border p-3">
                <p className="mb-2 font-medium">估算快照</p>
                {detailItem.report?.estimate ? (() => {
                  const estimate = normalizeEstimate(detailItem.report.estimate);
                  if (!estimate.salesRange) {
                    return <p className="text-xs text-muted-foreground">该记录未保存估算结果</p>;
                  }
                  return (
                  <div className="space-y-1 text-xs">
                    <p>
                      月销量: {estimate.salesRange[0]} - {estimate.salesRange[1]}
                    </p>
                    <p>
                      月销售额:{" "}
                      {estimate.revenueRange
                        ? `$${estimate.revenueRange[0]} - $${estimate.revenueRange[1]}`
                        : "未获取有效售价"}
                    </p>
                    <p>置信度: {confidenceLabel(estimate.confidence)}</p>
                    <p>依据:</p>
                    <ul className="space-y-1">
                      {estimate.evidence.map((x) => (
                        <li key={x}>- {x}</li>
                      ))}
                    </ul>
                    <p className="pt-1">风险:</p>
                    <ul className="space-y-1">
                      {estimate.risks.length === 0 ? (
                        <li>- 暂未识别到高风险项</li>
                      ) : (
                        estimate.risks.map((x) => <li key={x}>- {x}</li>)
                      )}
                    </ul>
                  </div>
                  );
                })() : (
                  <p className="text-xs text-muted-foreground">该记录未保存估算结果</p>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>{result.data.product.name || result.data.product.productId}</CardTitle>
            <CardDescription>
              品牌 {result.data.product.brand || "—"} · 类目 {result.data.product.category || "—"} · 价格 $
              {result.data.product.price?.toFixed(2) ?? "—"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">月销量区间</p>
                <p className="text-lg font-semibold">
                  {result.report.monthlySalesRange[0]} - {result.report.monthlySalesRange[1]}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">月销售额区间</p>
                <p className="text-lg font-semibold">
                  {result.report.monthlyRevenueRange[0] != null &&
                  result.report.monthlyRevenueRange[1] != null
                    ? `$${result.report.monthlyRevenueRange[0]} - $${result.report.monthlyRevenueRange[1]}`
                    : "未获取有效售价"}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">置信度</p>
                <p className="text-lg font-semibold">{confidenceLabel(result.report.confidence)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">评论趋势</p>
                <p className="text-lg font-semibold">{trendLabel(result.data.trend.trendDirection)}</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium">依据</p>
                <ul className="space-y-1 text-sm text-slate-700">
                  {result.report.evidence.map((x) => (
                    <li key={x}>- {x}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">风险</p>
                <ul className="space-y-1 text-sm text-slate-700">
                  {result.report.risks.length === 0 ? <li>- 暂未识别到高风险项</li> : result.report.risks.map((x) => <li key={x}>- {x}</li>)}
                </ul>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">关键词排名（Top）</p>
              <div className="flex flex-wrap gap-2">
                {topRankings.map((row) => (
                  <Badge key={`${row.keyword}-${row.rank ?? "na"}`} variant="secondary">
                    {row.keyword}: {row.rank ? `#${row.rank}` : "未进前列"}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-sm font-medium">模型依据明细</p>
              <div className="grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
                <p>评论总量: {result.report.modelDetail.reviewCount}</p>
                <p>近30天评论: {result.report.modelDetail.recent30dReviewCount}</p>
                <p>前20排名关键词: {result.report.modelDetail.rankedKeywordsTop20}</p>
                <p>评论驱动基数: {result.report.modelDetail.reviewDrivenBase}</p>
                <p>近30天驱动基数: {result.report.modelDetail.recentDrivenBase}</p>
                <p>排名倍率: {result.report.modelDetail.rankMultiplier}</p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                当前系数：reviewWeight={result.data.modelConfig.reviewWeight} recent30dWeight={result.data.modelConfig.recent30dWeight}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>历史记录</CardTitle>
          <CardDescription>点击链接可快速回填后重新分析。</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无历史数据</p>
          ) : (
            <div className="space-y-2">
              {history.map((item) => (
                <div key={item.id} className="w-full rounded-lg border p-3 text-left transition hover:bg-slate-50">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{item.productName || item.productId}</p>
                    <Badge variant="outline">{item.status}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString("zh-CN")}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-600">{item.competitorUrl}</p>
                  {item.report?.estimate ? (() => {
                    const estimate = normalizeEstimate(item.report.estimate);
                    return estimate.salesRange ? (
                      <p className="mt-1 text-xs text-slate-600">
                        月销量 {estimate.salesRange[0]} - {estimate.salesRange[1]}
                      </p>
                    ) : null;
                  })() : null}
                  {item.report?.modelConfig ? (
                    <p className="mt-1 text-xs text-slate-500">
                      系数 rw={item.report.modelConfig.reviewWeight} r30={item.report.modelConfig.recent30dWeight}
                    </p>
                  ) : null}
                  {item.errorMessage ? <p className="mt-1 text-xs text-red-600">{item.errorMessage}</p> : null}
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCompetitorUrl(item.competitorUrl);
                        if (item.report?.modelConfig) {
                          setModelConfig(item.report.modelConfig);
                          setActiveTemplate("default");
                        }
                      }}
                    >
                      回填参数
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setDetailItem(item)} className="gap-1.5">
                      <Eye className="size-4" />
                      查看详情
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
