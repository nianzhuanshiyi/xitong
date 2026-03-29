"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Box,
  ChevronRight,
  DollarSign,
  FlaskConical,
  Loader2,
  Rocket,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type TopPick = {
  id: string;
  reportDate: string;
  productName: string;
  productNameEn: string;
  executiveSummary: string;
  productSpec: string;
  keyIngredients: string;
  formulaSuggestion: string;
  marketAnalysis: string;
  competitorAnalysis: string;
  differentiationStrategy: string;
  estimatedRetailPrice: string | null;
  estimatedCogs: string | null;
  estimatedFbaFee: string | null;
  estimatedAdCost: string | null;
  estimatedProfit: string | null;
  estimatedMargin: string | null;
  breakEvenUnits: number | null;
  supplierPlan: string;
  timelinePlan: string;
  listingPlan: string;
  launchStrategy: string;
  riskAssessment: string;
  status: string;
  idea?: {
    totalScore: number;
    recommendation: string;
    trendScore: number;
    marketScore: number;
    competitionScore: number;
    profitScore: number;
  } | null;
};

type TimelineItem = { phase: string; duration: string; detail: string };

const TABS = [
  { key: "product", label: "产品方案", icon: FlaskConical },
  { key: "market", label: "市场分析", icon: TrendingUp },
  { key: "finance", label: "财务预估", icon: DollarSign },
  { key: "execution", label: "落地方案", icon: Rocket },
  { key: "risk", label: "风险评估", icon: ShieldAlert },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const REC_CONFIG: Record<string, { label: string; color: string }> = {
  strong_go: { label: "强烈推荐", color: "bg-emerald-100 text-emerald-800" },
  go: { label: "推荐", color: "bg-blue-100 text-blue-800" },
  watch: { label: "观望", color: "bg-amber-100 text-amber-800" },
  pass: { label: "放弃", color: "bg-slate-100 text-slate-600" },
};

function MarkdownBlock({ content }: { content: string }) {
  if (!content) return <p className="text-sm text-slate-400">暂无内容</p>;
  return (
    <div className="prose prose-sm prose-slate max-w-none">
      {content.split("\n").map((line, i) => {
        if (line.startsWith("### "))
          return (
            <h3
              key={i}
              className="mb-2 mt-4 text-base font-semibold text-slate-900"
            >
              {line.slice(4)}
            </h3>
          );
        if (line.startsWith("## "))
          return (
            <h2
              key={i}
              className="mb-2 mt-5 text-lg font-bold text-slate-900"
            >
              {line.slice(3)}
            </h2>
          );
        if (line.startsWith("# "))
          return (
            <h1 key={i} className="mb-3 mt-6 text-xl font-bold text-slate-900">
              {line.slice(2)}
            </h1>
          );
        if (line.startsWith("- ") || line.startsWith("* "))
          return (
            <li key={i} className="ml-4 text-sm text-slate-700">
              {renderBold(line.slice(2))}
            </li>
          );
        if (/^\d+\.\s/.test(line))
          return (
            <li key={i} className="ml-4 list-decimal text-sm text-slate-700">
              {renderBold(line.replace(/^\d+\.\s/, ""))}
            </li>
          );
        if (!line.trim()) return <div key={i} className="h-2" />;
        return (
          <p key={i} className="text-sm leading-relaxed text-slate-700">
            {renderBold(line)}
          </p>
        );
      })}
    </div>
  );
}

function renderBold(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(score, 100) / 100;
  const color = score >= 70 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444";
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#e2e8f0"
        strokeWidth={4}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={`${pct * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dy="0.35em"
        fontSize={size * 0.28}
        fontWeight="bold"
        fill={color}
      >
        {score}
      </text>
    </svg>
  );
}

export function TopPickDetail({ id }: { id: string }) {
  const [report, setReport] = useState<TopPick | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("product");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Use the history endpoint to find by id, or fetch latest and compare
      const r = await fetch("/api/beauty-ideas/top-pick");
      const j = await r.json();
      if (j.report && j.report.id === id) {
        setReport(j.report);
      } else {
        // Try history
        const r2 = await fetch("/api/beauty-ideas/top-pick/history");
        const j2 = await r2.json();
        const found = (j2.reports ?? []).find(
          (rp: { id: string }) => rp.id === id
        );
        if (found) {
          // Found in history but need full data — refetch via latest (limited)
          // For now show what we have from history with limited fields
          setReport(found);
        }
      }
    } catch {
      toast.error("加载失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-8 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!report) {
    return (
      <div className="py-20 text-center text-slate-500">方案不存在</div>
    );
  }

  const idea = report.idea;
  const rec = idea
    ? REC_CONFIG[idea.recommendation] ?? REC_CONFIG.watch
    : null;

  let spec: Record<string, string> = {};
  try {
    spec = JSON.parse(report.productSpec || "{}");
  } catch {
    /* ignore */
  }

  let timeline: TimelineItem[] = [];
  try {
    timeline = JSON.parse(report.timelinePlan || "[]");
  } catch {
    /* ignore */
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/beauty-ideas"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600"
      >
        <ArrowLeft className="size-4" />
        返回创意列表
      </Link>

      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50 via-purple-50/60 to-pink-50/40 p-6 shadow-sm sm:p-8">
        <div
          className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-indigo-300/20 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
          {idea && <ScoreRing score={idea.totalScore} size={72} />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-xl font-bold text-slate-900 sm:text-2xl">
                {report.productName}
              </h1>
              {rec && (
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    rec.color
                  )}
                >
                  {rec.label}
                </span>
              )}
            </div>
            {report.productNameEn && (
              <p className="mt-0.5 text-sm text-slate-500">
                {report.productNameEn}
              </p>
            )}
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              {report.executiveSummary}
            </p>
            {idea && (
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                <span>趋势 {idea.trendScore}/25</span>
                <span>市场 {idea.marketScore}/25</span>
                <span>竞争 {idea.competitionScore}/25</span>
                <span>利润 {idea.profitScore}/25</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition whitespace-nowrap",
              activeTab === key
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="space-y-6">
        {activeTab === "product" && (
          <>
            {/* Spec card */}
            {Object.keys(spec).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Box className="size-4" /> 产品规格
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {Object.entries(spec).map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-slate-50 p-3">
                        <p className="text-xs font-medium text-slate-500">
                          {specLabel(k)}
                        </p>
                        <p className="mt-0.5 text-sm font-medium text-slate-800">
                          {Array.isArray(v) ? v.join("、") : String(v)}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">核心成分详解</CardTitle>
              </CardHeader>
              <CardContent>
                <MarkdownBlock content={report.keyIngredients} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">配方建议</CardTitle>
              </CardHeader>
              <CardContent>
                <MarkdownBlock content={report.formulaSuggestion} />
              </CardContent>
            </Card>
          </>
        )}

        {activeTab === "market" && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">市场分析</CardTitle>
              </CardHeader>
              <CardContent>
                <MarkdownBlock content={report.marketAnalysis} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">竞品分析</CardTitle>
              </CardHeader>
              <CardContent>
                <MarkdownBlock content={report.competitorAnalysis} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">差异化策略</CardTitle>
              </CardHeader>
              <CardContent>
                <MarkdownBlock content={report.differentiationStrategy} />
              </CardContent>
            </Card>
          </>
        )}

        {activeTab === "finance" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">财务预估</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {[
                      ["建议零售价", report.estimatedRetailPrice],
                      ["预估成本 (COGS)", report.estimatedCogs],
                      ["预估 FBA 费用", report.estimatedFbaFee],
                      ["预估广告费/单", report.estimatedAdCost],
                      ["预估单品利润", report.estimatedProfit],
                      ["预估利润率", report.estimatedMargin],
                      [
                        "盈亏平衡销量",
                        report.breakEvenUnits
                          ? `${report.breakEvenUnits} 件/月`
                          : null,
                      ],
                    ]
                      .filter(([, v]) => v)
                      .map(([label, value]) => (
                        <tr key={String(label)} className="border-b last:border-0">
                          <td className="py-3 pr-4 font-medium text-slate-600">
                            {String(label)}
                          </td>
                          <td className="py-3 text-right font-semibold text-slate-900">
                            {String(value)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Visual margin bar */}
              {report.estimatedMargin && (
                <div className="mt-6 rounded-lg bg-slate-50 p-4">
                  <p className="text-xs font-medium text-slate-500">利润率</p>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="h-3 flex-1 rounded-full bg-slate-200">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          parseFloat(report.estimatedMargin) >= 60
                            ? "bg-emerald-500"
                            : parseFloat(report.estimatedMargin) >= 40
                              ? "bg-amber-500"
                              : "bg-red-500"
                        )}
                        style={{
                          width: `${Math.min(parseFloat(report.estimatedMargin) || 0, 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-lg font-bold text-slate-900">
                      {report.estimatedMargin}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "execution" && (
          <>
            {/* Timeline */}
            {timeline.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">项目时间线</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative space-y-0">
                    {timeline.map((item, i) => (
                      <div key={i} className="relative flex gap-4 pb-6 last:pb-0">
                        {/* Vertical line */}
                        {i < timeline.length - 1 && (
                          <div className="absolute left-[15px] top-8 h-full w-0.5 bg-indigo-100" />
                        )}
                        {/* Dot */}
                        <div className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 ring-2 ring-white">
                          {i + 1}
                        </div>
                        <div className="min-w-0 flex-1 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">
                              {item.phase}
                            </span>
                            <ChevronRight className="size-3 text-slate-400" />
                            <span className="text-xs font-medium text-indigo-600">
                              {item.duration}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-slate-600">
                            {item.detail}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">供应商对接方案</CardTitle>
              </CardHeader>
              <CardContent>
                <MarkdownBlock content={report.supplierPlan} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Listing 方案</CardTitle>
              </CardHeader>
              <CardContent>
                <MarkdownBlock content={report.listingPlan} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">上架策略</CardTitle>
              </CardHeader>
              <CardContent>
                <MarkdownBlock content={report.launchStrategy} />
              </CardContent>
            </Card>
          </>
        )}

        {activeTab === "risk" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">风险评估</CardTitle>
            </CardHeader>
            <CardContent>
              <MarkdownBlock content={report.riskAssessment} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Bottom actions */}
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <Link href="/dashboard/beauty-ideas">
          <Button variant="outline">返回创意列表</Button>
        </Link>
      </div>
    </div>
  );
}

function specLabel(key: string): string {
  const map: Record<string, string> = {
    volume: "容量/规格",
    packaging: "包装形式",
    shelfLife: "保质期",
    ingredientRatio: "成分配比",
    certifications: "所需认证",
    fdaCompliance: "FDA 合规",
  };
  return map[key] ?? key;
}
