"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Crown,
  FlaskConical,
  Loader2,
  Search,
  ThumbsDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ModuleGuide } from "@/components/shared/module-guide";

/* ── Types ───────────────────────────────────────────────────── */

type LatestPlan = {
  id: string;
  reportDate: string;
  productName: string;
  productNameEn: string;
  executiveSummary: string;
  selectedKeyword: string;
  searchVolume: number | null;
  supplyDemandRatio: number | null;
  clickConcentration: number | null;
  totalScore: number;
  recommendation: string;
  competitionLevel: string;
  estimatedRetailPrice: string | null;
  estimatedCogs: string | null;
  estimatedMargin: string | null;
  estimatedProfit: string | null;
  keyFeatures: string;
  qualifiedKeywords: string;
  keywordsData: string;
  competitorProducts: string;
  status: string;
  dismissed: boolean;
  createdAt: string;
};

type HistoryItem = {
  id: string;
  reportDate: string;
  productName: string;
  productNameEn: string;
  executiveSummary: string;
  selectedKeyword: string;
  searchVolume: number | null;
  totalScore: number;
  recommendation: string;
  competitionLevel: string;
  estimatedRetailPrice: string | null;
  estimatedMargin: string | null;
  dismissed: boolean;
  createdAt: string;
};

type KeywordResult = {
  keyword: string;
  searches: number | null;
  products: number | null;
  sdr: number | null;
  monopolyClickRate: number | null;
  passed: boolean;
  failReasons: string[];
};

const REC_CONFIG: Record<string, { label: string; color: string }> = {
  strong_go: { label: "蓝海机会", color: "bg-emerald-100 text-emerald-800" },
  go: { label: "有潜力", color: "bg-blue-100 text-blue-800" },
  watch: { label: "需差异化", color: "bg-amber-100 text-amber-800" },
  pass: { label: "红海", color: "bg-red-100 text-red-700" },
};

const COMPETITION_LABEL: Record<string, { label: string; color: string }> = {
  low: { label: "低竞争", color: "bg-emerald-100 text-emerald-700" },
  medium: { label: "中等竞争", color: "bg-amber-100 text-amber-700" },
  high: { label: "高竞争", color: "bg-red-100 text-red-700" },
  extreme: { label: "极度竞争", color: "bg-red-200 text-red-800" },
};

/* ── Score Ring ──────────────────────────────────────────────── */

function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(score, 100) / 100;
  const color = score >= 75 ? "#22c55e" : score >= 55 ? "#3b82f6" : score >= 35 ? "#f59e0b" : "#ef4444";
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={4} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={4} strokeLinecap="round"
        strokeDasharray={`${pct * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em" fontSize={size * 0.28} fontWeight="bold" fill={color}>
        {score}
      </text>
    </svg>
  );
}

/* ── Keyword Screening Panel ─────────────────────────────────── */

function KeywordScreeningPanel({ plan }: { plan: LatestPlan }) {
  const [expanded, setExpanded] = useState(false);

  let keywords: KeywordResult[] = [];
  try { keywords = JSON.parse(plan.keywordsData || "[]"); } catch { keywords = []; }

  if (keywords.length === 0) return null;

  const passed = keywords.filter((k) => k.passed);
  const failed = keywords.filter((k) => !k.passed);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50 rounded-xl"
      >
        <div className="flex items-center gap-2">
          <Search className="size-4 text-violet-500" />
          <span className="text-sm font-semibold text-slate-700">品类筛选详情</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            {passed.length} 通过
          </span>
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-600">
            {failed.length} 未通过
          </span>
        </div>
        {expanded ? <ChevronDown className="size-4 text-slate-400" /> : <ChevronRight className="size-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
          <div className="mb-2 grid grid-cols-5 gap-2 text-[11px] font-semibold text-slate-400 px-1">
            <span>关键词</span>
            <span className="text-center">月搜索量</span>
            <span className="text-center">供需比</span>
            <span className="text-center">点击集中度</span>
            <span className="text-center">状态</span>
          </div>
          <div className="space-y-1.5">
            {keywords.map((kw, i) => (
              <div
                key={i}
                className={cn(
                  "grid grid-cols-5 gap-2 items-center rounded-lg px-1 py-2 text-xs",
                  kw.passed ? "bg-emerald-50/50" : "bg-red-50/30"
                )}
              >
                <span className="font-medium text-slate-700 truncate">{kw.keyword}</span>
                <span className={cn("text-center", kw.searches !== null && kw.searches >= 5000 ? "text-emerald-700 font-semibold" : "text-red-600")}>
                  {kw.searches !== null ? kw.searches.toLocaleString() : "—"}
                </span>
                <span className={cn("text-center", kw.sdr !== null && kw.sdr >= 0.5 ? "text-emerald-700 font-semibold" : "text-red-600")}>
                  {kw.sdr !== null ? kw.sdr.toFixed(2) : "—"}
                </span>
                <span className={cn("text-center", kw.monopolyClickRate !== null && kw.monopolyClickRate <= 0.4 ? "text-emerald-700 font-semibold" : kw.monopolyClickRate !== null ? "text-red-600" : "text-slate-400")}>
                  {kw.monopolyClickRate !== null ? `${(kw.monopolyClickRate * 100).toFixed(0)}%` : "—"}
                </span>
                <span className={cn("text-center text-[10px] font-semibold rounded-full px-2 py-0.5", kw.passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>
                  {kw.passed ? "✓ 通过" : "✗ 未通过"}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[11px] text-slate-400 space-y-0.5">
            <p>筛选标准：月搜索量 ≥ 5,000 · 供需比 ≥ 0.5 · 点击集中度 ≤ 40%</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main Dashboard ──────────────────────────────────────────── */

export function BeautyIdeasDashboard() {
  const [latestPlan, setLatestPlan] = useState<LatestPlan | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const loadLatest = useCallback(async () => {
    try {
      const r = await fetch("/api/beauty-ideas/generate");
      const j = await r.json();
      setLatestPlan(j.plan ?? null);
    } catch { /* ignore */ }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch("/api/beauty-ideas/history");
      const j = await r.json();
      setHistory(j.plans ?? []);
    } catch { /* ignore */ }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadLatest(), loadHistory()]);
    setLoading(false);
  }, [loadLatest, loadHistory]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      toast.info("AI 正在扫描美妆品类趋势、卖家精灵筛选中…", { duration: 120000 });
      const r = await fetch("/api/beauty-ideas/generate", { method: "POST" });
      const j = await r.json();
      if (!r.ok) { toast.error(j.message ?? "生成失败"); return; }
      toast.success(`新方案已生成：${j.plan?.productName ?? ""}`);
      if (j.plan) setLatestPlan(j.plan);
      await loadHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGenerating(false);
      toast.dismiss();
    }
  };

  const handleDismiss = async () => {
    if (!latestPlan) return;
    setDismissing(true);
    try {
      const r = await fetch(`/api/beauty-ideas/plans/${latestPlan.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });
      if (!r.ok) { toast.error("操作失败"); return; }
      toast.success("已跳过此方案");
      setLatestPlan(null);
      await loadAll();
    } catch {
      toast.error("操作失败");
    } finally {
      setDismissing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const rec = latestPlan ? (REC_CONFIG[latestPlan.recommendation] ?? REC_CONFIG.watch) : null;
  const comp = latestPlan ? (COMPETITION_LABEL[latestPlan.competitionLevel] ?? null) : null;

  return (
    <div className="space-y-6">
      <ModuleGuide moduleKey="beauty-ideas">
        <p className="font-medium text-foreground mb-1">AI 美妆新品创意 · 卖家精灵数据驱动</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>三步工作流：品类筛选（卖家精灵）→ 竞品筛选 → AI 生成最优新品方案</li>
          <li>品类筛选标准：月搜≥5,000 · 供需比≥0.5 · 均价$15-40 · 点击集中度≤40%</li>
          <li>竞品筛选标准：月销≥300 · 月收入≥$5,000 · 评论50-2,000</li>
          <li>AI 综合数据生成 1 个最优新品方案，含竞品分析、差异化策略、财务预估</li>
        </ul>
      </ModuleGuide>

      {/* ── Latest Plan (Hero) ──────────────────────────────── */}
      {latestPlan ? (
        <div className="relative overflow-hidden rounded-2xl border-2 border-rose-200/80 bg-gradient-to-br from-rose-50 via-pink-50/50 to-fuchsia-50/30 p-5 shadow-sm sm:p-6">
          <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-rose-200/20 blur-3xl" aria-hidden />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex flex-col items-center gap-2">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-400 to-pink-500 text-white shadow-lg">
                <FlaskConical className="size-7" />
              </div>
              <ScoreRing score={latestPlan.totalScore} size={52} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-rose-600">
                  最新方案 · {latestPlan.reportDate}
                </p>
                {rec && (
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", rec.color)}>
                    {rec.label}
                  </span>
                )}
                {comp && (
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", comp.color)}>
                    {comp.label}
                  </span>
                )}
                {latestPlan.estimatedMargin && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    利润率 {latestPlan.estimatedMargin}
                  </span>
                )}
                {latestPlan.searchVolume && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                    月搜 {latestPlan.searchVolume.toLocaleString()}
                  </span>
                )}
                {latestPlan.selectedKeyword && (
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700">
                    {latestPlan.selectedKeyword}
                  </span>
                )}
              </div>

              <h2 className="mt-1.5 font-heading text-lg font-bold text-slate-900 sm:text-xl">
                {latestPlan.productName}
              </h2>
              {latestPlan.productNameEn && (
                <p className="text-xs text-slate-500">{latestPlan.productNameEn}</p>
              )}
              <p className="mt-2 text-sm leading-relaxed text-slate-600 line-clamp-3">
                {latestPlan.executiveSummary}
              </p>

              <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                {latestPlan.estimatedRetailPrice && (
                  <span>预估售价 {latestPlan.estimatedRetailPrice}</span>
                )}
                {latestPlan.estimatedCogs && <span>成本 {latestPlan.estimatedCogs}</span>}
                {latestPlan.supplyDemandRatio !== null && (
                  <span>供需比 {latestPlan.supplyDemandRatio.toFixed(2)}</span>
                )}
                {latestPlan.clickConcentration !== null && (
                  <span>点击集中度 {(latestPlan.clickConcentration * 100).toFixed(0)}%</span>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <Link href={`/dashboard/beauty-ideas/${latestPlan.id}`}>
                <Button className="gap-1.5 bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow hover:from-rose-600 hover:to-pink-600">
                  查看完整方案
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                disabled={generating}
                className="gap-1 text-xs"
              >
                {generating ? <Loader2 className="size-3 animate-spin" /> : <Crown className="size-3" />}
                生成新方案
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDismiss}
                disabled={dismissing}
                className="gap-1 text-xs text-slate-500"
              >
                {dismissing ? <Loader2 className="size-3 animate-spin" /> : <ThumbsDown className="size-3" />}
                不感兴趣
              </Button>
            </div>
          </div>

          {/* Keyword screening summary */}
          <div className="mt-4">
            <KeywordScreeningPanel plan={latestPlan} />
          </div>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-rose-300/60 bg-gradient-to-br from-rose-50/50 to-pink-50/30 p-8 text-center">
          <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-rose-200/15 blur-3xl" aria-hidden />
          {generating ? (
            <>
              <Loader2 className="mx-auto size-12 animate-spin text-rose-500" />
              <h3 className="mt-4 font-heading text-lg font-semibold text-slate-700">
                AI 正在分析中…
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                正在调用卖家精灵筛选品类 → 竞品扫描 → AI 生成最优新品方案
              </p>
              <div className="mx-auto mt-4 h-1.5 w-48 overflow-hidden rounded-full bg-rose-100">
                <div className="h-full animate-pulse rounded-full bg-gradient-to-r from-rose-400 to-pink-500" style={{ width: "60%" }} />
              </div>
            </>
          ) : (
            <>
              <FlaskConical className="mx-auto size-12 text-rose-300" />
              <h3 className="mt-4 font-heading text-lg font-semibold text-slate-700">
                暂无美妆新品方案
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                点击生成，AI 将调用卖家精灵数据筛选美妆品类，找到 1 个最优新品方向
              </p>
              <Button
                onClick={handleGenerate}
                disabled={generating}
                className="mt-5 gap-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow hover:from-rose-600 hover:to-pink-600"
              >
                <FlaskConical className="size-4" />
                生成美妆新品方案
              </Button>
            </>
          )}
        </div>
      )}

      {/* ── History ─────────────────────────────────────────── */}
      {history.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="size-4 text-slate-400" />
                历史方案
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  {history.length}
                </span>
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setHistoryExpanded(!historyExpanded)}
                className="text-xs text-slate-500"
              >
                {historyExpanded ? "收起" : "展开"}
                <ChevronDown className={cn("ml-1 size-3 transition-transform", historyExpanded && "rotate-180")} />
              </Button>
            </div>
          </CardHeader>

          {historyExpanded && (
            <CardContent>
              <div className="space-y-2">
                {history.map((item) => {
                  const r = REC_CONFIG[item.recommendation] ?? REC_CONFIG.watch;
                  return (
                    <Link key={item.id} href={`/dashboard/beauty-ideas/${item.id}`}>
                      <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 hover:bg-rose-50/40 hover:border-rose-200/60 transition-colors">
                        <ScoreRing score={item.totalScore} size={40} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-800">
                              {item.productName}
                            </p>
                            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", r.color)}>
                              {r.label}
                            </span>
                            {item.dismissed && (
                              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-400">
                                已跳过
                              </span>
                            )}
                          </div>
                          <div className="flex gap-3 text-[11px] text-slate-400 mt-0.5">
                            {item.selectedKeyword && <span>{item.selectedKeyword}</span>}
                            {item.searchVolume && <span>月搜 {item.searchVolume.toLocaleString()}</span>}
                            {item.estimatedRetailPrice && <span>{item.estimatedRetailPrice}</span>}
                            {item.estimatedMargin && <span>利润率 {item.estimatedMargin}</span>}
                          </div>
                        </div>
                        <div className="shrink-0 text-[11px] text-slate-400">{item.reportDate}</div>
                        <ChevronRight className="size-4 text-slate-300" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* ── Criteria Reference ──────────────────────────────── */}
      <Card className="border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-slate-600">
            <TrendingUp className="size-4" />
            筛选标准参考
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-bold text-slate-700">第1步：品类筛选（卖家精灵）</p>
              <ul className="space-y-1 text-xs text-slate-500">
                <li className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-rose-400 shrink-0" />
                  月搜索量 ≥ 5,000
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-rose-400 shrink-0" />
                  供需比 ≥ 0.5（搜索量/商品数）
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-rose-400 shrink-0" />
                  均价 $15–$40
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-rose-400 shrink-0" />
                  点击集中度 ≤ 40%
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-rose-400 shrink-0" />
                  购买率 ≥ 1%
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-rose-400 shrink-0" />
                  搜索增长率 ≥ 0%
                </li>
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-bold text-slate-700">第2步：竞品筛选（具体 ASIN）</p>
              <ul className="space-y-1 text-xs text-slate-500">
                <li className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-pink-400 shrink-0" />
                  价格 $15–$40
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-pink-400 shrink-0" />
                  月销量 ≥ 300（市场已验证）
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-pink-400 shrink-0" />
                  月销售额 ≥ $5,000
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-pink-400 shrink-0" />
                  评论数 50–2,000
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
