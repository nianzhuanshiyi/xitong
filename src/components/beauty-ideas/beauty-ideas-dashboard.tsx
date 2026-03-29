"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
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

/* ── Types ────────────────────────────────────────────────────── */

type TopPick = {
  id: string;
  reportDate: string;
  productName: string;
  productNameEn: string;
  executiveSummary: string;
  estimatedMargin: string | null;
  estimatedRetailPrice: string | null;
  estimatedCogs: string | null;
  estimatedProfit: string | null;
  status: string;
  phase: string;
  briefIngredients: string;
  briefCompetition: string;
  briefScore: number;
  createdAt: string;
  idea?: {
    totalScore: number;
    recommendation: string;
    searchVolume: number | null;
  } | null;
};

type HistoryItem = {
  id: string;
  reportDate: string;
  productName: string;
  productNameEn: string;
  executiveSummary: string;
  estimatedMargin: string | null;
  estimatedRetailPrice: string | null;
  status: string;
  phase: string;
  briefScore: number;
  briefCompetition: string;
  briefIngredients: string;
  createdAt: string;
  idea?: { totalScore: number; recommendation: string } | null;
};

type TrendItem = {
  id: string;
  title: string;
  market: string;
  category: string;
  trendScore: number;
  content: string;
  scannedAt: string;
};

const REC_CONFIG: Record<string, { label: string; color: string }> = {
  strong_go: { label: "强烈推荐", color: "bg-emerald-100 text-emerald-800" },
  go: { label: "推荐", color: "bg-blue-100 text-blue-800" },
  watch: { label: "观望", color: "bg-amber-100 text-amber-800" },
  pass: { label: "放弃", color: "bg-slate-100 text-slate-600" },
};

const COMPETITION_LABEL: Record<string, { label: string; color: string }> = {
  low: { label: "低竞争", color: "bg-emerald-100 text-emerald-700" },
  medium: { label: "中等竞争", color: "bg-amber-100 text-amber-700" },
  high: { label: "高竞争", color: "bg-red-100 text-red-700" },
};

/* ── Score Ring ────────────────────────────────────────────────── */

function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(score, 100) / 100;
  const color = score >= 70 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444";
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

/* ── Main Dashboard ───────────────────────────────────────────── */

export function BeautyIdeasDashboard() {
  const [topPick, setTopPick] = useState<TopPick | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [deepLoading, setDeepLoading] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [trendsExpanded, setTrendsExpanded] = useState(false);

  const loadTopPick = useCallback(async () => {
    try {
      const r = await fetch("/api/beauty-ideas/top-pick");
      const j = await r.json();
      if (j.report) {
        // Show report if completed (brief or deep), or generating
        if (j.report.status === "completed" && !j.report.dismissed) {
          setTopPick(j.report);
        } else {
          setTopPick(null);
        }
      } else {
        setTopPick(null);
      }
    } catch { /* ignore */ }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch("/api/beauty-ideas/top-pick/history");
      const j = await r.json();
      setHistory(j.reports ?? []);
    } catch { /* ignore */ }
  }, []);

  const loadTrends = useCallback(async () => {
    try {
      const r = await fetch("/api/beauty-ideas/trends");
      const j = await r.json();
      const all = j.trends ?? [];
      const weekAgo = Date.now() - 7 * 86400_000;
      setTrends(
        all.filter((t: TrendItem) => new Date(t.scannedAt).getTime() > weekAgo)
      );
    } catch { /* ignore */ }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadTopPick(), loadHistory(), loadTrends()]);
    setLoading(false);
  }, [loadTopPick, loadHistory, loadTrends]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      toast.info("AI 正在扫描趋势、精选产品…", { duration: 60000 });
      const r = await fetch("/api/beauty-ideas/top-pick", { method: "POST" });
      const j = await r.json();
      if (!r.ok) { toast.error(j.message ?? "生成失败"); return; }
      if (j.skipped) {
        toast.success("今日方案已存在");
        // Directly set the returned report
        if (j.report) setTopPick(j.report);
      } else {
        toast.success(`方案已生成：${j.report?.productName ?? ""}`);
        // Directly set the returned report
        if (j.report) setTopPick(j.report);
      }
      // Also reload history
      await loadHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGenerating(false);
      toast.dismiss();
    }
  };

  const handleDeepAnalysis = async () => {
    if (!topPick) return;
    setDeepLoading(true);
    try {
      toast.info("AI 正在生成深度分析…", { duration: 60000 });
      const r = await fetch(`/api/beauty-ideas/top-pick/${topPick.id}/deep`, {
        method: "POST",
      });
      const j = await r.json();
      if (!r.ok) { toast.error(j.message ?? "深度分析失败"); return; }
      if (j.skipped) {
        toast.info("深度分析已完成");
      } else {
        toast.success("深度分析已生成");
      }
      // Navigate to detail page
      window.location.href = `/dashboard/beauty-ideas/top-pick/${topPick.id}`;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "深度分析失败");
    } finally {
      setDeepLoading(false);
    }
  };

  const handleDismiss = async () => {
    if (!topPick) return;
    setDismissing(true);
    try {
      const r = await fetch("/api/beauty-ideas/top-pick", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: topPick.id, action: "dismiss" }),
      });
      if (!r.ok) { toast.error("操作失败"); return; }
      toast.success("已跳过，下次将避开类似品类");
      setTopPick(null);
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

  const rec = topPick?.idea
    ? REC_CONFIG[topPick.idea.recommendation] ?? REC_CONFIG.watch
    : null;
  const comp = topPick?.briefCompetition
    ? COMPETITION_LABEL[topPick.briefCompetition] ?? null
    : null;
  const isBrief = topPick?.phase === "brief";
  // Check if report is old format (has completed status but no brief data)
  const isOldFormat = topPick && topPick.status === "completed" && topPick.briefScore === 0;

  return (
    <div className="space-y-6">
      {/* ── Today's Pick (Hero) ──────────────────────────────── */}
      {topPick && !isOldFormat ? (
        <div className="relative overflow-hidden rounded-2xl border-2 border-amber-200/80 bg-gradient-to-br from-amber-50 via-orange-50/50 to-yellow-50/30 p-5 shadow-sm sm:p-6">
          <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-amber-200/20 blur-3xl" aria-hidden />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex flex-col items-center gap-2">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg">
                <Crown className="size-7" />
              </div>
              <ScoreRing score={topPick.briefScore || topPick.idea?.totalScore || 0} size={52} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-600">
                  今日精选 · {topPick.reportDate}
                </p>
                {isBrief && (
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                    简报
                  </span>
                )}
                {!isBrief && (
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                    深度分析
                  </span>
                )}
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
                {topPick.estimatedMargin && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    利润率 {topPick.estimatedMargin}
                  </span>
                )}
                {topPick.idea?.searchVolume && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                    月搜 {topPick.idea.searchVolume.toLocaleString()}
                  </span>
                )}
              </div>
              <h2 className="mt-1.5 font-heading text-lg font-bold text-slate-900 sm:text-xl">
                {topPick.productName}
              </h2>
              {topPick.productNameEn && (
                <p className="text-xs text-slate-500">{topPick.productNameEn}</p>
              )}
              <p className="mt-2 text-sm leading-relaxed text-slate-600 line-clamp-3">
                {topPick.executiveSummary}
              </p>
              {/* Brief-specific info */}
              {isBrief && topPick.briefIngredients && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {topPick.briefIngredients.split(",").map((ing, i) => (
                    <span key={i} className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
                      {ing.trim()}
                    </span>
                  ))}
                </div>
              )}
              {/* Brief price/margin summary */}
              {isBrief && topPick.estimatedRetailPrice && (
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>预估售价 {topPick.estimatedRetailPrice}</span>
                  {topPick.estimatedCogs && <span>成本 {topPick.estimatedCogs}</span>}
                  {topPick.estimatedMargin && <span>利润率 {topPick.estimatedMargin}</span>}
                </div>
              )}
              {/* Quick financial stats (deep phase) */}
              {!isBrief && topPick.estimatedRetailPrice && (
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>售价 {topPick.estimatedRetailPrice}</span>
                  {topPick.estimatedProfit && <span>单品利润 {topPick.estimatedProfit}</span>}
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              {isBrief ? (
                <>
                  <Button
                    onClick={handleDeepAnalysis}
                    disabled={deepLoading}
                    className="gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow hover:from-amber-600 hover:to-orange-600"
                  >
                    {deepLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Search className="size-4" />
                    )}
                    {deepLoading ? "分析中…" : "深度分析"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDismiss}
                    disabled={dismissing}
                    className="gap-1 text-xs text-slate-500"
                  >
                    {dismissing ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <ThumbsDown className="size-3" />
                    )}
                    不感兴趣
                  </Button>
                </>
              ) : (
                <Link href={`/dashboard/beauty-ideas/top-pick/${topPick.id}`}>
                  <Button className="gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow hover:from-amber-600 hover:to-orange-600">
                    查看完整方案
                  </Button>
                </Link>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                disabled={generating}
                className="gap-1 text-xs"
              >
                {generating ? <Loader2 className="size-3 animate-spin" /> : <Crown className="size-3" />}
                重新生成
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Empty state / Generate button */
        <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-amber-300/60 bg-gradient-to-br from-amber-50/50 to-orange-50/30 p-8 text-center">
          <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-amber-200/15 blur-3xl" aria-hidden />
          {generating ? (
            <>
              <Loader2 className="mx-auto size-12 animate-spin text-amber-500" />
              <h3 className="mt-4 font-heading text-lg font-semibold text-slate-700">
                AI 正在分析中…
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                正在扫描 Top 5 美妆趋势，精选最佳产品方向
              </p>
              <div className="mx-auto mt-4 h-1.5 w-48 overflow-hidden rounded-full bg-amber-100">
                <div className="h-full animate-pulse rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: "60%" }} />
              </div>
            </>
          ) : (
            <>
              <Crown className="mx-auto size-12 text-amber-400/60" />
              <h3 className="mt-4 font-heading text-lg font-semibold text-slate-700">
                {isOldFormat ? "重新生成今日方案" : "一键生成今日新品方案"}
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                AI 自动扫描 Top 5 趋势，精选 1 个最佳方向，生成简报卡片
                <br />
                <span className="text-xs text-slate-400">
                  感兴趣再点&quot;深度分析&quot;生成完整落地方案，节省 token
                </span>
              </p>
              <Button
                onClick={handleGenerate}
                disabled={generating}
                size="lg"
                className="mt-5 gap-2 bg-gradient-to-r from-amber-500 to-orange-500 px-8 text-white shadow-lg hover:from-amber-600 hover:to-orange-600"
              >
                <Crown className="size-5" />
                {isOldFormat ? "重新生成（新格式）" : "生成今日新品方案"}
              </Button>
            </>
          )}
        </div>
      )}

      {/* ── History Archive ──────────────────────────────────── */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Clock className="size-4 text-slate-400" />
          历史方案存档
          {history.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              {history.length}
            </span>
          )}
        </h3>
        {history.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-slate-400">
              <FlaskConical className="mx-auto mb-2 size-8 text-slate-300" />
              暂无历史方案，生成第一个方案后将显示在这里
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-500">日期</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-500">方案标题</th>
                  <th className="hidden px-4 py-2.5 text-center font-medium text-slate-500 sm:table-cell">评分</th>
                  <th className="hidden px-4 py-2.5 text-center font-medium text-slate-500 sm:table-cell">推荐</th>
                  <th className="hidden px-4 py-2.5 text-center font-medium text-slate-500 md:table-cell">阶段</th>
                  <th className="hidden px-4 py-2.5 text-right font-medium text-slate-500 md:table-cell">利润率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((h) => {
                  const hRec = h.idea
                    ? REC_CONFIG[h.idea.recommendation] ?? REC_CONFIG.watch
                    : null;
                  const score = h.briefScore || h.idea?.totalScore || 0;
                  return (
                    <tr
                      key={h.id}
                      className="cursor-pointer transition hover:bg-slate-50/80"
                      onClick={() => { window.location.href = `/dashboard/beauty-ideas/top-pick/${h.id}`; }}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                        {h.reportDate}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-900 line-clamp-1">
                            {h.productName}
                          </p>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400 line-clamp-1 sm:hidden">
                          {h.executiveSummary}
                        </p>
                      </td>
                      <td className="hidden px-4 py-3 text-center sm:table-cell">
                        <span className={cn(
                          "inline-flex size-8 items-center justify-center rounded-full text-xs font-bold",
                          score >= 70 ? "bg-emerald-50 text-emerald-700" :
                          score >= 50 ? "bg-amber-50 text-amber-700" :
                          "bg-slate-50 text-slate-600"
                        )}>
                          {score}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-center sm:table-cell">
                        {hRec && (
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", hRec.color)}>
                            {hRec.label}
                          </span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-center md:table-cell">
                        <span className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-medium",
                          h.phase === "deep"
                            ? "bg-indigo-50 text-indigo-600"
                            : "bg-violet-50 text-violet-600"
                        )}>
                          {h.phase === "deep" ? "深度" : "简报"}
                        </span>
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-right text-xs font-medium text-emerald-600 md:table-cell">
                        {h.estimatedMargin || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Recent Trends (collapsible) ──────────────────────── */}
      {trends.length > 0 && (
        <div>
          <button
            onClick={() => setTrendsExpanded(!trendsExpanded)}
            className="mb-3 flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <TrendingUp className="size-4 text-slate-400" />
            <ChevronDown className={cn("size-4 transition-transform", trendsExpanded && "rotate-180")} />
            最近趋势（{trends.length}）
            <span className="ml-auto">
              <Link
                href="/dashboard/beauty-ideas/trends"
                className="text-xs text-indigo-600 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                查看全部
              </Link>
            </span>
          </button>
          {trendsExpanded && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {trends.slice(0, 9).map((t) => (
                <Card key={t.id} className="transition hover:shadow-sm">
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        {t.market}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        {t.category}
                      </span>
                      <span className="ml-auto text-xs font-bold text-amber-600">
                        {t.trendScore}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 pt-1">
                    <h4 className="font-medium text-slate-900 text-sm line-clamp-1">
                      {t.title}
                    </h4>
                    <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                      {t.content}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
