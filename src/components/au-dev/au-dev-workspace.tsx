"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Package,
  Star,
  TrendingUp,
  ImagePlus,
  Download,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  Trash2,
  Rocket,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AnalysisListItem {
  id: string;
  asin: string;
  productTitle: string | null;
  productImage: string | null;
  price: number | null;
  status: string;
  createdAt: string;
}

interface TopProduct {
  rank: number;
  title: string;
  price: number;
  rating: number;
  reviews: number;
  monthlySales: number;
}

interface MarketOverview {
  competitionLevel: string;
  topConcentration: string;
  avgReviews: number;
  newProductShare: string;
  entryBudget: string;
  entryTime: string;
  summary: string;
  topProducts: TopProduct[];
}

interface DiffPlanItem {
  title: string;
  description: string;
  extraCost: string;
  advantage: string;
  imagePrompt: string;
  generatedImage?: string;
}

interface ProfitModel {
  suggestedPrice: number;
  priceRange: string;
  reasoning: string;
  estimatedFba: number;
  estimatedRefFee: number;
}

interface ActionStep {
  step: number;
  title: string;
  description: string;
  timeline: string;
  cost: string;
}

interface FullAnalysis {
  id: string;
  asin: string;
  productTitle: string | null;
  productImage: string | null;
  price: number | null;
  rating: number | null;
  reviews: number | null;
  bsr: number | null;
  categoryPath: string | null;
  monthlySales: number | null;
  monthlyRevenue: number | null;
  sellerName: string | null;
  sellerNation: string | null;
  fulfillment: string | null;
  marketOverview: string | null;
  diffPlan: string | null;
  profitModel: string | null;
  actionPlan: string | null;
  generatedImages: string | null;
  status: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Helper: safe JSON parse                                            */
/* ------------------------------------------------------------------ */

function safeParse<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AuDevWorkspace() {
  const [analyses, setAnalyses] = useState<AnalysisListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState<FullAnalysis | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ step: 0, label: "", percent: 0 });
  const [loading, setLoading] = useState(true);

  /* ---------- data fetching ---------- */

  const fetchAnalyses = useCallback(async () => {
    try {
      const res = await fetch("/api/au-dev/analyses");
      if (res.ok) {
        const data = await res.json();
        setAnalyses(data);
      }
    } catch (err) {
      console.error("Failed to load analyses", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAnalysis = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/au-dev/analyses/${id}`);
      if (res.ok) {
        const data: FullAnalysis = await res.json();
        setSelectedAnalysis(data);
      }
    } catch (err) {
      console.error("Failed to load analysis", err);
    }
  }, []);

  useEffect(() => {
    fetchAnalyses();
  }, [fetchAnalyses]);

  useEffect(() => {
    if (selectedId) fetchAnalysis(selectedId);
  }, [selectedId, fetchAnalysis]);

  /* ---------- actions ---------- */

  const handleNewAnalysis = () => {
    setSelectedId(null);
    setSelectedAnalysis(null);
    setInputValue("");
    setAnalyzing(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除此分析？")) return;
    try {
      await fetch(`/api/au-dev/analyses/${id}`, { method: "DELETE" });
      setAnalyses((prev) => prev.filter((a) => a.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setSelectedAnalysis(null);
      }
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const handleAnalyze = async () => {
    if (!inputValue.trim() || analyzing) return;
    setAnalyzing(true);
    setProgress({ step: 0, label: "准备中...", percent: 0 });
    setSelectedAnalysis(null);
    setSelectedId(null);

    try {
      const res = await fetch("/api/au-dev/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: inputValue.trim() }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === "progress") {
              setProgress({ step: event.step, label: event.label, percent: event.percent });
            } else if (event.type === "complete") {
              setSelectedId(event.id);
              setInputValue("");
              fetchAnalyses();
              fetchAnalysis(event.id);
            } else if (event.type === "error") {
              alert(event.message);
            }
          } catch {
            /* ignore non-JSON lines */
          }
        }
      }
    } catch (err) {
      console.error(err);
      alert("分析请求失败");
    } finally {
      setAnalyzing(false);
    }
  };

  /* ---------- derived data ---------- */

  const marketOverview = safeParse<MarketOverview>(selectedAnalysis?.marketOverview);
  const diffPlan = safeParse<DiffPlanItem[]>(selectedAnalysis?.diffPlan);
  const profitModel = safeParse<ProfitModel>(selectedAnalysis?.profitModel);
  const actionPlan = safeParse<ActionStep[]>(selectedAnalysis?.actionPlan);
  const isComplete = selectedAnalysis?.status === "completed";

  /* ---------- render ---------- */

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0">
      {/* ==================== Left sidebar ==================== */}
      <div className="w-[280px] shrink-0 border-r flex flex-col">
        <div className="p-3 border-b">
          <Button onClick={handleNewAnalysis} disabled={analyzing} className="w-full bg-teal-600 hover:bg-teal-700">
            <Plus className="mr-2 h-4 w-4" /> 新建分析
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : analyses.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">暂无分析记录</p>
          ) : (
            <div className="flex flex-col">
              {analyses.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`flex items-start gap-3 p-3 cursor-pointer border-b hover:bg-muted/50 transition-colors ${
                    selectedId === item.id ? "ring-2 ring-teal-500 bg-teal-50/50" : ""
                  }`}
                >
                  <div className="w-12 h-12 shrink-0 rounded bg-muted flex items-center justify-center overflow-hidden">
                    {item.productImage ? (
                      <img src={item.productImage} alt="" className="object-contain w-full h-full" />
                    ) : (
                      <Package className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.productTitle || item.asin}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-muted-foreground">
                        {item.price != null ? `A$${item.price}` : "—"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(item.id);
                    }}
                    className="shrink-0 p-1 rounded hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ==================== Right panel ==================== */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* ----- Analyzing state ----- */}
        {analyzing && (
          <div className="max-w-lg mx-auto mt-20 space-y-6">
            <h2 className="text-lg font-semibold text-center">正在分析...</h2>
            <Progress value={progress.percent} className="h-3" />
            <p className="text-center text-sm text-muted-foreground">
              步骤 {progress.step}/4 &mdash; {progress.label}
            </p>
          </div>
        )}

        {/* ----- Empty / input state ----- */}
        {!analyzing && !selectedAnalysis && (
          <div className="max-w-lg mx-auto mt-20 space-y-6">
            <div className="text-center space-y-2">
              <Rocket className="h-12 w-12 mx-auto text-teal-500" />
              <h2 className="text-xl font-semibold">澳洲站竞品分析 &amp; 开发方案</h2>
              <p className="text-sm text-muted-foreground">
                输入 ASIN 或产品链接，AI 将自动分析竞品、市场、差异化方案与利润
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="输入 ASIN 或 Amazon 产品链接..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !analyzing && handleAnalyze()}
                className="flex-1 h-10"
                disabled={analyzing}
              />
              <Button
                onClick={handleAnalyze}
                disabled={!inputValue.trim() || analyzing}
                className="bg-teal-600 hover:bg-teal-700 h-10 px-6"
              >
                {analyzing ? "分析中..." : "开始分析"}
              </Button>
            </div>
          </div>
        )}

        {/* ----- Completed analysis ----- */}
        {!analyzing && selectedAnalysis && isComplete && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Section 1: 竞品快照 */}
            <SnapshotSection analysis={selectedAnalysis} />

            {/* Section 2: 市场环境 */}
            {marketOverview && <MarketSection market={marketOverview} />}

            {/* Section 3: 差异化开发方案 */}
            {diffPlan && diffPlan.length > 0 && (
              <DiffPlanSection items={diffPlan} analysisId={selectedAnalysis.id} />
            )}

            {/* Section 4: 利润计算器 */}
            <ProfitSection profitModel={profitModel} />

            {/* Section 5: 行动计划 */}
            {actionPlan && actionPlan.length > 0 && <ActionPlanSection steps={actionPlan} />}
          </div>
        )}

        {/* ----- Non-completed selected analysis ----- */}
        {!analyzing && selectedAnalysis && !isComplete && (
          <div className="max-w-lg mx-auto mt-20 text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-teal-500 mx-auto" />
            <p className="text-muted-foreground">分析状态: {selectedAnalysis.status}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Section 1: 竞品快照                                                */
/* ================================================================== */

function SnapshotSection({ analysis }: { analysis: FullAnalysis }) {
  const fields: { label: string; value: string | number | null | undefined }[] = [
    { label: "标题", value: analysis.productTitle },
    { label: "价格", value: analysis.price != null ? `A$${analysis.price}` : null },
    { label: "评分", value: analysis.rating != null ? `${analysis.rating} ⭐` : null },
    { label: "评论数", value: analysis.reviews },
    { label: "BSR", value: analysis.bsr != null ? `#${analysis.bsr.toLocaleString()}` : null },
    { label: "类目", value: analysis.categoryPath },
    { label: "月销量", value: analysis.monthlySales?.toLocaleString() },
    { label: "月收入", value: analysis.monthlyRevenue != null ? `A$${analysis.monthlyRevenue.toLocaleString()}` : null },
    { label: "卖家", value: analysis.sellerName },
    { label: "卖家国籍", value: analysis.sellerNation },
    { label: "配送", value: analysis.fulfillment },
  ];

  return (
    <Card className="border-teal-200">
      <CardHeader>
        <CardTitle className="text-teal-700">竞品快照</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-6">
          <div className="w-48 h-48 shrink-0 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
            {analysis.productImage ? (
              <img src={analysis.productImage} alt="" className="object-contain w-full h-full" />
            ) : (
              <Package className="h-12 w-12 text-muted-foreground" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm flex-1">
            {fields.map((f) => (
              <div key={f.label}>
                <span className="text-muted-foreground">{f.label}</span>
                <p className="font-medium">{f.value ?? "—"}</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/*  Section 2: 市场环境                                                */
/* ================================================================== */

function MarketSection({ market }: { market: MarketOverview }) {
  const [showTable, setShowTable] = useState(false);

  const metrics = [
    { label: "头部集中度", value: market.topConcentration, icon: TrendingUp },
    { label: "平均评价数", value: market.avgReviews.toLocaleString(), icon: Star },
    { label: "新品机会", value: market.newProductShare, icon: Rocket },
  ];

  return (
    <Card className="border-teal-200">
      <CardHeader>
        <CardTitle className="text-teal-700">市场环境</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* metric cards */}
        <div className="grid grid-cols-3 gap-4">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="rounded-lg border border-teal-100 bg-teal-50/50 p-4 text-center"
            >
              <m.icon className="h-5 w-5 mx-auto text-teal-600 mb-1" />
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className="text-lg font-semibold text-teal-700">{m.value}</p>
            </div>
          ))}
        </div>

        {/* summary */}
        <div className="rounded-lg bg-teal-50/70 border border-teal-100 p-4 text-sm leading-relaxed">
          <p className="font-medium text-teal-700 mb-1">AI 判断</p>
          <p className="text-muted-foreground">{market.summary}</p>
          <div className="flex gap-4 mt-2 text-xs">
            <span>竞争程度: <strong>{market.competitionLevel}</strong></span>
            <span>入场预算: <strong>{market.entryBudget}</strong></span>
            <span>入场时间: <strong>{market.entryTime}</strong></span>
          </div>
        </div>

        {/* top products table */}
        {market.topProducts && market.topProducts.length > 0 && (
          <div>
            <button
              onClick={() => setShowTable(!showTable)}
              className="flex items-center gap-1 text-sm text-teal-600 hover:text-teal-800 font-medium"
            >
              Top {market.topProducts.length} 产品
              {showTable ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showTable && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4">#</th>
                      <th className="py-2 pr-4">标题</th>
                      <th className="py-2 pr-4">价格</th>
                      <th className="py-2 pr-4">评分</th>
                      <th className="py-2 pr-4">评论</th>
                      <th className="py-2">月销量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {market.topProducts.map((p) => (
                      <tr key={p.rank} className="border-b last:border-0">
                        <td className="py-2 pr-4">{p.rank}</td>
                        <td className="py-2 pr-4 max-w-[200px] truncate">{p.title}</td>
                        <td className="py-2 pr-4">A${p.price}</td>
                        <td className="py-2 pr-4">{p.rating}</td>
                        <td className="py-2 pr-4">{p.reviews.toLocaleString()}</td>
                        <td className="py-2">{p.monthlySales.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/*  Section 3: 差异化开发方案                                           */
/* ================================================================== */

function DiffPlanSection({ items, analysisId }: { items: DiffPlanItem[]; analysisId: string }) {
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null);
  const [images, setImages] = useState<Record<number, string>>({});

  const handleGenerateImage = async (idx: number, item: DiffPlanItem) => {
    setGeneratingIdx(idx);
    try {
      const res = await fetch("/api/au-dev/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId,
          prompt: item.imagePrompt,
          diffDirection: item.title,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setImages((prev) => ({ ...prev, [idx]: data.imageUrl }));
      } else {
        alert("图片生成失败");
      }
    } catch {
      alert("图片生成请求失败");
    } finally {
      setGeneratingIdx(null);
    }
  };

  const handleDownload = (url: string, title: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}.png`;
    a.click();
  };

  return (
    <Card className="border-teal-200">
      <CardHeader>
        <CardTitle className="text-teal-700">差异化开发方案</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item, idx) => {
            const img = images[idx] || item.generatedImage;
            return (
              <div key={idx} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <h4 className="font-semibold">{item.title}</h4>
                  <Badge variant="secondary">{item.extraCost}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{item.description}</p>
                <p className="text-sm">
                  <span className="text-teal-700 font-medium">优势: </span>
                  {item.advantage}
                </p>

                {/* image area */}
                {img && (
                  <div className="space-y-2">
                    <img src={img} alt={item.title} className="w-full rounded-lg border" />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGenerateImage(idx, item)}
                        disabled={generatingIdx === idx}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" /> 重新生成
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(img, item.title)}
                      >
                        <Download className="mr-1 h-3 w-3" /> 下载
                      </Button>
                    </div>
                  </div>
                )}

                {!img && (
                  <Button
                    size="sm"
                    className="bg-teal-600 hover:bg-teal-700"
                    onClick={() => handleGenerateImage(idx, item)}
                    disabled={generatingIdx === idx}
                  >
                    {generatingIdx === idx ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <ImagePlus className="mr-1 h-3 w-3" />
                    )}
                    生成效果图
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/*  Section 4: 利润计算器                                              */
/* ================================================================== */

function ProfitSection({ profitModel }: { profitModel: ProfitModel | null }) {
  const [costs, setCosts] = useState({
    purchaseCost: 0,
    firstMile: 15,
    fbaFee: profitModel?.estimatedFba || 8,
    referralPct: 15,
    adPct: 15,
    exchangeRate: 4.6,
    sellingPrice: profitModel?.suggestedPrice || 0,
  });

  const update = (key: keyof typeof costs, val: number) =>
    setCosts((prev) => ({ ...prev, [key]: val }));

  const costInAud = (costs.purchaseCost + costs.firstMile) / costs.exchangeRate;
  const referralFee = (costs.sellingPrice * costs.referralPct) / 100;
  const adFee = (costs.sellingPrice * costs.adPct) / 100;
  const totalCost = costInAud + costs.fbaFee + referralFee + adFee;
  const profit = costs.sellingPrice - totalCost;
  const profitMargin = costs.sellingPrice > 0 ? (profit / costs.sellingPrice) * 100 : 0;
  const breakEvenDaily =
    profit > 0 ? Math.ceil((costs.firstMile * 30) / (profit * costs.exchangeRate)) : 0;

  const inputFields: { label: string; key: keyof typeof costs; suffix: string }[] = [
    { label: "采购成本", key: "purchaseCost", suffix: "RMB" },
    { label: "头程运费/件", key: "firstMile", suffix: "RMB" },
    { label: "FBA 费用", key: "fbaFee", suffix: "AUD" },
    { label: "佣金比例", key: "referralPct", suffix: "%" },
    { label: "广告占比", key: "adPct", suffix: "%" },
    { label: "汇率", key: "exchangeRate", suffix: "RMB/AUD" },
    { label: "售价", key: "sellingPrice", suffix: "AUD" },
  ];

  const resultCards = [
    { label: "单件利润", value: `A$${profit.toFixed(2)}`, color: profit >= 0 ? "text-teal-700" : "text-red-600" },
    { label: "利润率", value: `${profitMargin.toFixed(1)}%`, color: profitMargin >= 20 ? "text-teal-700" : "text-amber-600" },
    { label: "保本日销", value: `${breakEvenDaily} 件/天`, color: "text-teal-700" },
    { label: "总成本", value: `A$${totalCost.toFixed(2)}`, color: "text-slate-700" },
  ];

  return (
    <Card className="border-teal-200">
      <CardHeader>
        <CardTitle className="text-teal-700">利润计算器</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {profitModel && (
          <div className="rounded-lg bg-teal-50/70 border border-teal-100 p-3 text-sm space-y-1">
            <p>
              <span className="text-teal-700 font-medium">建议售价: </span>
              A${profitModel.suggestedPrice} ({profitModel.priceRange})
            </p>
            <p className="text-muted-foreground">{profitModel.reasoning}</p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {inputFields.map((f) => (
            <div key={f.key} className="space-y-1">
              <label className="text-xs text-muted-foreground">{f.label}</label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={costs[f.key]}
                  onChange={(e) => update(f.key, parseFloat(e.target.value) || 0)}
                  className="h-8"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">{f.suffix}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {resultCards.map((r) => (
            <div key={r.label} className="rounded-lg border border-teal-100 bg-teal-50/50 p-3 text-center">
              <p className="text-xs text-muted-foreground">{r.label}</p>
              <p className={`text-lg font-semibold ${r.color}`}>{r.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/*  Section 5: 行动计划                                                */
/* ================================================================== */

function ActionPlanSection({ steps }: { steps: ActionStep[] }) {
  return (
    <Card className="border-teal-200">
      <CardHeader>
        <CardTitle className="text-teal-700">行动计划</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative pl-8">
          {steps.map((step, i) => (
            <div key={i} className="relative pb-8 last:pb-0">
              <div className="absolute left-[-25px] top-1 w-6 h-6 rounded-full bg-teal-100 border-2 border-teal-500 flex items-center justify-center text-xs font-bold text-teal-700">
                {step.step}
              </div>
              {i < steps.length - 1 && (
                <div className="absolute left-[-13px] top-7 w-0.5 h-full bg-teal-200" />
              )}
              <div>
                <h4 className="font-semibold">{step.title}</h4>
                <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span>⏱ {step.timeline}</span>
                  <span>💰 {step.cost}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
