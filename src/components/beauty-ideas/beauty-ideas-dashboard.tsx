"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  FlaskConical,
  Loader2,
  Radar,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Idea = {
  id: string;
  name: string;
  category: string;
  targetMarket: string;
  keyIngredients: string[];
  totalScore: number;
  trendScore: number;
  marketScore: number;
  competitionScore: number;
  profitScore: number;
  recommendation: string;
  searchVolume: number | null;
  competitionLevel: string | null;
  estimatedPrice: string | null;
  status: string;
  createdAt: string;
  trend?: { title: string; market: string } | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  skincare: "护肤",
  makeup: "彩妆",
  haircare: "护发",
  bodycare: "身体护理",
  fragrance: "香水香氛",
};

const REC_CONFIG: Record<string, { label: string; color: string }> = {
  strong_go: { label: "强烈推荐", color: "bg-emerald-100 text-emerald-800" },
  go: { label: "推荐", color: "bg-blue-100 text-blue-800" },
  watch: { label: "观望", color: "bg-amber-100 text-amber-800" },
  pass: { label: "放弃", color: "bg-slate-100 text-slate-600" },
};

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  validated: "已验证",
  developing: "开发中",
  abandoned: "已放弃",
};

function ScoreRing({ score, size = 48 }: { score: number; size?: number }) {
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

function SubScoreBar({ label, value, max = 25 }: { label: string; value: number; max?: number }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className="w-8 shrink-0 text-right text-slate-500">{label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-indigo-400"
          style={{ width: `${Math.min((value / max) * 100, 100)}%` }}
        />
      </div>
      <span className="w-5 text-right font-medium text-slate-700">{value}</span>
    </div>
  );
}

export function BeautyIdeasDashboard() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [filterCat, setFilterCat] = useState("");
  const [filterRec, setFilterRec] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [trendCount, setTrendCount] = useState(0);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [todayReport, setTodayReport] = useState<{
    id: string;
    reportDate: string;
    trendsFound: number;
    ideasGenerated: number;
    highScoreIdeas: number;
    trendsSummary: string;
    ideasSummary: string;
    status: string;
  } | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const loadIdeas = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterCat) params.set("category", filterCat);
      if (filterRec) params.set("recommendation", filterRec);
      if (filterStatus) params.set("status", filterStatus);
      const r = await fetch(`/api/beauty-ideas?${params}`);
      const j = await r.json();
      setIdeas(j.ideas ?? []);
    } catch {
      toast.error("加载失败");
    } finally {
      setLoading(false);
    }
  }, [filterCat, filterRec, filterStatus]);

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch("/api/beauty-ideas/trends?");
      const j = await r.json();
      const trends = j.trends ?? [];
      const weekAgo = Date.now() - 7 * 86400_000;
      const recent = trends.filter((t: { createdAt: string }) => new Date(t.createdAt).getTime() > weekAgo);
      setTrendCount(recent.length);
      if (trends.length > 0) {
        setLastScan(new Date(trends[0].scannedAt).toLocaleString("zh-CN"));
      }
    } catch { /* ignore */ }
  }, []);

  const loadReport = useCallback(async () => {
    try {
      const r = await fetch("/api/beauty-ideas/reports");
      const j = await r.json();
      const reports = j.reports ?? [];
      if (reports.length > 0) {
        setTodayReport(reports[0]);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadIdeas(); }, [loadIdeas]);
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadReport(); }, [loadReport]);

  const handleScan = async () => {
    setScanning(true);
    try {
      toast.info("正在扫描趋势…");
      const r1 = await fetch("/api/beauty-ideas/scan", { method: "POST" });
      const j1 = await r1.json();
      if (!r1.ok) { toast.error(j1.message ?? "扫描失败"); return; }
      toast.success(j1.message);

      toast.info("正在生成创意…");
      const r2 = await fetch("/api/beauty-ideas/generate", { method: "POST" });
      const j2 = await r2.json();
      if (!r2.ok) { toast.error(j2.message ?? "生成失败"); return; }
      toast.success(j2.message);

      loadIdeas();
      loadStats();
      loadReport();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setScanning(false);
    }
  };

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    try {
      toast.info("正在生成今日报告…");
      const r = await fetch("/api/beauty-ideas/reports/generate", { method: "POST" });
      const j = await r.json();
      if (!r.ok) { toast.error(j.message ?? "生成失败"); return; }
      if (j.skipped) { toast.info("今日报告已存在"); }
      else { toast.success("今日报告生成完成"); }
      loadReport();
      loadIdeas();
      loadStats();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGeneratingReport(false);
    }
  };

  const draftCount = ideas.filter((i) => i.status === "draft").length;
  const highScoreCount = ideas.filter((i) => i.totalScore >= 70).length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">本周新趋势</CardTitle>
            <TrendingUp className="size-4 text-slate-400" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{trendCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">待评估创意</CardTitle>
            <FlaskConical className="size-4 text-slate-400" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{draftCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">高分创意 (≥70)</CardTitle>
            <Star className="size-4 text-amber-400" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold text-emerald-600">{highScoreCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">最新扫描</CardTitle>
            <Radar className="size-4 text-slate-400" />
          </CardHeader>
          <CardContent><p className="text-sm font-medium">{lastScan ?? "从未扫描"}</p></CardContent>
        </Card>
      </div>

      {/* Today's Report */}
      {todayReport && todayReport.status === "completed" && (
        <Card className="border-indigo-200 bg-gradient-to-r from-indigo-50/50 to-purple-50/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-indigo-800">
              <CalendarCheck className="size-4" />
              {todayReport.reportDate} 日报
            </CardTitle>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>{todayReport.trendsFound} 趋势</span>
              <span>{todayReport.ideasGenerated} 创意</span>
              <span className="font-semibold text-emerald-600">{todayReport.highScoreIdeas} 高分</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {todayReport.ideasSummary && (
              <div className="text-xs leading-relaxed text-slate-700 whitespace-pre-line">
                {todayReport.ideasSummary}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleScan} disabled={scanning} className="gap-1.5">
          {scanning ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {scanning ? "扫描中…" : "扫描趋势 & 生成创意"}
        </Button>
        <Button
          onClick={handleGenerateReport}
          disabled={generatingReport || scanning}
          variant="outline"
          className="gap-1.5"
        >
          {generatingReport ? <Loader2 className="size-4 animate-spin" /> : <CalendarCheck className="size-4" />}
          {generatingReport ? "生成中…" : "生成今日报告"}
        </Button>
        <Link href="/dashboard/beauty-ideas/trends">
          <Button variant="outline" className="gap-1.5">
            <TrendingUp className="size-4" />
            查看趋势
          </Button>
        </Link>

        <div className="ml-auto flex flex-wrap gap-2">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-xs"
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
          >
            <option value="">全部品类</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-xs"
            value={filterRec}
            onChange={(e) => setFilterRec(e.target.value)}
          >
            <option value="">全部推荐</option>
            {Object.entries(REC_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-xs"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">全部状态</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Ideas Grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-slate-400" />
        </div>
      ) : ideas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 py-16 text-center text-sm text-slate-500">
          暂无创意，点击「扫描趋势」开始
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ideas.map((idea) => {
            const rec = REC_CONFIG[idea.recommendation] ?? REC_CONFIG.watch;
            return (
              <Link key={idea.id} href={`/dashboard/beauty-ideas/${idea.id}`} className="block">
                <Card className="h-full transition hover:shadow-md">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <ScoreRing score={idea.totalScore} />
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-slate-900 line-clamp-2">{idea.name}</h3>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            {CATEGORY_LABELS[idea.category] ?? idea.category}
                          </span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            {idea.targetMarket}
                          </span>
                          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", rec.color)}>
                            {rec.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Ingredients */}
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {(idea.keyIngredients as string[]).slice(0, 4).map((ing, i) => (
                        <span key={i} className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                          {ing}
                        </span>
                      ))}
                    </div>

                    {/* Sub scores */}
                    <div className="mt-3 space-y-1">
                      <SubScoreBar label="趋势" value={idea.trendScore} />
                      <SubScoreBar label="市场" value={idea.marketScore} />
                      <SubScoreBar label="竞争" value={idea.competitionScore} />
                      <SubScoreBar label="利润" value={idea.profitScore} />
                    </div>

                    {/* Bottom info */}
                    <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
                      {idea.estimatedPrice && <span>{idea.estimatedPrice}</span>}
                      {idea.searchVolume && <span>月搜{idea.searchVolume.toLocaleString()}</span>}
                      {idea.competitionLevel && <span>竞争:{idea.competitionLevel}</span>}
                      <span className="ml-auto rounded bg-slate-50 px-1.5 py-0.5 text-[10px]">
                        {STATUS_LABELS[idea.status] ?? idea.status}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
