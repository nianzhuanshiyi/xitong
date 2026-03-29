"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Box,
  ChevronRight,
  DollarSign,
  Download,
  FlaskConical,
  Loader2,
  Rocket,
  Search,
  ShieldAlert,
  ThumbsDown,
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
  phase: string;
  briefIngredients: string;
  briefCompetition: string;
  briefScore: number;
  ideaId: string | null;
  idea?: {
    id: string;
    totalScore: number;
    recommendation: string;
    trendScore: number;
    marketScore: number;
    competitionScore: number;
    profitScore: number;
    searchVolume: number | null;
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

const COMPETITION_LABEL: Record<string, string> = {
  low: "低竞争",
  medium: "中等竞争",
  high: "高竞争",
};

function MarkdownBlock({ content }: { content: string }) {
  if (!content) return <p className="text-sm text-slate-400">暂无内容</p>;
  return (
    <div className="prose prose-sm prose-slate max-w-none">
      {content.split("\n").map((line, i) => {
        if (line.startsWith("### "))
          return (
            <h3 key={i} className="mb-2 mt-4 text-base font-semibold text-slate-900">
              {line.slice(4)}
            </h3>
          );
        if (line.startsWith("## "))
          return (
            <h2 key={i} className="mb-2 mt-5 text-lg font-bold text-slate-900">
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

/* ── PDF Export via Print ─────────────────────────────────────── */

function exportPDF(report: TopPick) {
  const isBrief = report.phase === "brief";
  const compLabel = COMPETITION_LABEL[report.briefCompetition] || report.briefCompetition;

  let spec: Record<string, string> = {};
  try { spec = JSON.parse(report.productSpec || "{}"); } catch { /* ignore */ }

  let timeline: TimelineItem[] = [];
  try { timeline = JSON.parse(report.timelinePlan || "[]"); } catch { /* ignore */ }

  const mdToHtml = (md: string) => {
    if (!md) return "";
    return md
      .split("\n")
      .map((line) => {
        if (line.startsWith("### ")) return `<h3>${line.slice(4)}</h3>`;
        if (line.startsWith("## ")) return `<h2>${line.slice(3)}</h2>`;
        if (line.startsWith("# ")) return `<h1>${line.slice(2)}</h1>`;
        if (line.startsWith("- ") || line.startsWith("* "))
          return `<li>${line.slice(2)}</li>`;
        if (/^\d+\.\s/.test(line))
          return `<li>${line.replace(/^\d+\.\s/, "")}</li>`;
        if (!line.trim()) return "<br/>";
        return `<p>${line}</p>`;
      })
      .join("\n");
  };

  const briefHTML = `
    <div class="section">
      <h2>简报概览</h2>
      <table>
        <tr><td>推荐理由</td><td>${report.executiveSummary}</td></tr>
        <tr><td>核心成分</td><td>${report.briefIngredients}</td></tr>
        <tr><td>竞争程度</td><td>${compLabel}</td></tr>
        <tr><td>预估售价</td><td>${report.estimatedRetailPrice || "-"}</td></tr>
        <tr><td>预估利润率</td><td>${report.estimatedMargin || "-"}</td></tr>
        <tr><td>信心评分</td><td>${report.briefScore}/100</td></tr>
      </table>
    </div>
  `;

  const deepHTML = isBrief
    ? ""
    : `
    ${Object.keys(spec).length > 0 ? `
    <div class="section">
      <h2>产品规格</h2>
      <table>
        ${Object.entries(spec).map(([k, v]) => `<tr><td>${specLabel(k)}</td><td>${v}</td></tr>`).join("")}
      </table>
    </div>
    ` : ""}
    <div class="section">
      <h2>核心成分详解</h2>
      ${mdToHtml(report.keyIngredients)}
    </div>
    <div class="section">
      <h2>配方建议</h2>
      ${mdToHtml(report.formulaSuggestion)}
    </div>
    <div class="section">
      <h2>市场分析</h2>
      ${mdToHtml(report.marketAnalysis)}
    </div>
    <div class="section">
      <h2>竞品分析</h2>
      ${mdToHtml(report.competitorAnalysis)}
    </div>
    <div class="section">
      <h2>差异化策略</h2>
      ${mdToHtml(report.differentiationStrategy)}
    </div>
    <div class="section">
      <h2>财务预估</h2>
      <table>
        ${[
          ["建议零售价", report.estimatedRetailPrice],
          ["预估成本 (COGS)", report.estimatedCogs],
          ["预估 FBA 费用", report.estimatedFbaFee],
          ["预估广告费/单", report.estimatedAdCost],
          ["预估单品利润", report.estimatedProfit],
          ["预估利润率", report.estimatedMargin],
          ["盈亏平衡销量", report.breakEvenUnits ? `${report.breakEvenUnits} 件/月` : null],
        ]
          .filter(([, v]) => v)
          .map(([label, value]) => `<tr><td>${label}</td><td>${value}</td></tr>`)
          .join("")}
      </table>
    </div>
    ${timeline.length > 0 ? `
    <div class="section">
      <h2>项目时间线</h2>
      <table>
        <tr><th>阶段</th><th>周期</th><th>内容</th></tr>
        ${timeline.map((t) => `<tr><td>${t.phase}</td><td>${t.duration}</td><td>${t.detail}</td></tr>`).join("")}
      </table>
    </div>
    ` : ""}
    <div class="section">
      <h2>供应商方案</h2>
      ${mdToHtml(report.supplierPlan)}
    </div>
    <div class="section">
      <h2>Listing 方案</h2>
      ${mdToHtml(report.listingPlan)}
    </div>
    <div class="section">
      <h2>上架策略</h2>
      ${mdToHtml(report.launchStrategy)}
    </div>
    <div class="section">
      <h2>风险评估</h2>
      ${mdToHtml(report.riskAssessment)}
    </div>
  `;

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${report.productName} - 美妆新品方案</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, "Microsoft YaHei", sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 32px; color: #334155; font-size: 14px; line-height: 1.6; }
    h1 { font-size: 22px; color: #0f172a; margin-bottom: 4px; }
    .subtitle { font-size: 13px; color: #64748b; margin-bottom: 16px; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-right: 6px; }
    .badge-brief { background: #ede9fe; color: #6d28d9; }
    .badge-deep { background: #e0e7ff; color: #4338ca; }
    .badge-score { background: #dcfce7; color: #15803d; }
    .section { margin-top: 24px; page-break-inside: avoid; }
    .section h2 { font-size: 16px; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 12px; }
    .section h3 { font-size: 14px; color: #334155; margin: 12px 0 6px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    td, th { padding: 8px 12px; border: 1px solid #e2e8f0; text-align: left; font-size: 13px; }
    th { background: #f8fafc; font-weight: 600; }
    tr td:first-child { font-weight: 500; color: #475569; white-space: nowrap; width: 140px; }
    li { margin-left: 20px; margin-bottom: 4px; }
    p { margin-bottom: 6px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>${report.productName}</h1>
  ${report.productNameEn ? `<p class="subtitle">${report.productNameEn}</p>` : ""}
  <div style="margin-bottom: 16px;">
    <span class="badge ${isBrief ? "badge-brief" : "badge-deep"}">${isBrief ? "简报" : "深度分析"}</span>
    <span class="badge badge-score">评分 ${report.briefScore}/100</span>
    <span style="font-size:12px;color:#64748b;">${report.reportDate}</span>
  </div>
  ${briefHTML}
  ${deepHTML}
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">
    美妆新品方案 · 由 AI 分析生成 · ${report.reportDate}
  </div>
</body>
</html>`;

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    toast.error("请允许弹出窗口以导出 PDF");
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  // Small delay to ensure styles are loaded
  setTimeout(() => {
    printWindow.print();
  }, 300);
}

/* ── Main Component ──────────────────────────────────────────── */

export function TopPickDetail({ id }: { id: string }) {
  const [report, setReport] = useState<TopPick | null>(null);
  const [loading, setLoading] = useState(true);
  const [deepLoading, setDeepLoading] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("product");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/beauty-ideas/top-pick/${id}`);
      if (r.ok) {
        const j = await r.json();
        setReport(j.report ?? null);
      }
    } catch {
      toast.error("加载失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleDeepAnalysis = async () => {
    if (!report) return;
    setDeepLoading(true);
    try {
      toast.info("AI 正在生成深度分析…", { duration: 60000 });
      const r = await fetch(`/api/beauty-ideas/top-pick/${id}/deep`, {
        method: "POST",
      });
      const j = await r.json();
      if (!r.ok) { toast.error(j.message ?? "深度分析失败"); return; }
      toast.success("深度分析已生成");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "深度分析失败");
    } finally {
      setDeepLoading(false);
      toast.dismiss();
    }
  };

  const handleDismiss = async () => {
    if (!report) return;
    setDismissing(true);
    try {
      const r = await fetch("/api/beauty-ideas/top-pick", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: report.id, action: "dismiss" }),
      });
      if (!r.ok) { toast.error("操作失败"); return; }
      toast.success("已标记为不感兴趣");
      window.location.href = "/dashboard/beauty-ideas";
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
  if (!report) {
    return <div className="py-20 text-center text-slate-500">方案不存在</div>;
  }

  const idea = report.idea;
  const rec = idea ? REC_CONFIG[idea.recommendation] ?? REC_CONFIG.watch : null;
  const isBrief = report.phase === "brief";
  const compLabel = COMPETITION_LABEL[report.briefCompetition] || "";

  let spec: Record<string, string> = {};
  try { spec = JSON.parse(report.productSpec || "{}"); } catch { /* ignore */ }

  let timeline: TimelineItem[] = [];
  try { timeline = JSON.parse(report.timelinePlan || "[]"); } catch { /* ignore */ }

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
        <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-indigo-300/20 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
          <ScoreRing score={report.briefScore || idea?.totalScore || 0} size={72} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-xl font-bold text-slate-900 sm:text-2xl">
                {report.productName}
              </h1>
              {isBrief && (
                <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700">
                  简报
                </span>
              )}
              {!isBrief && (
                <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                  深度分析
                </span>
              )}
              {rec && (
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", rec.color)}>
                  {rec.label}
                </span>
              )}
            </div>
            {report.productNameEn && (
              <p className="mt-0.5 text-sm text-slate-500">{report.productNameEn}</p>
            )}
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              {report.executiveSummary}
            </p>
            {idea && !isBrief && (
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                <span>趋势 {idea.trendScore}/25</span>
                <span>市场 {idea.marketScore}/25</span>
                <span>竞争 {idea.competitionScore}/25</span>
                <span>利润 {idea.profitScore}/25</span>
              </div>
            )}
          </div>
          {/* Action buttons in hero */}
          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            {isBrief && (
              <Button
                onClick={handleDeepAnalysis}
                disabled={deepLoading}
                className="gap-1.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow hover:from-indigo-600 hover:to-purple-600"
              >
                {deepLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                {deepLoading ? "分析中…" : "深度分析"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportPDF(report)}
              className="gap-1.5 text-xs"
            >
              <Download className="size-3" />
              导出 PDF
            </Button>
          </div>
        </div>
      </div>

      {/* ── Brief Info Cards ─────────────────────────────────── */}
      {isBrief && (
        <div className="space-y-4">
          {/* Row 1: Competition + Financial Overview */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Competition Card */}
            {compLabel && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-500">竞争程度</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "h-3 flex-1 rounded-full",
                      report.briefCompetition === "low" ? "bg-emerald-200" :
                      report.briefCompetition === "medium" ? "bg-amber-200" : "bg-red-200"
                    )}>
                      <div className={cn(
                        "h-full rounded-full",
                        report.briefCompetition === "low" ? "w-1/3 bg-emerald-500" :
                        report.briefCompetition === "medium" ? "w-2/3 bg-amber-500" : "w-full bg-red-500"
                      )} />
                    </div>
                    <span className="text-sm font-semibold text-slate-700">{compLabel}</span>
                  </div>
                </CardContent>
              </Card>
            )}
            {/* Price/Margin Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-500">财务概览</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {report.estimatedRetailPrice && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">预估售价</span>
                      <span className="font-semibold text-slate-900">{report.estimatedRetailPrice}</span>
                    </div>
                  )}
                  {report.estimatedCogs && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">预估成本</span>
                      <span className="font-semibold text-slate-900">{report.estimatedCogs}</span>
                    </div>
                  )}
                  {report.estimatedMargin && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">预估利润率</span>
                      <span className="font-semibold text-emerald-600">{report.estimatedMargin}</span>
                    </div>
                  )}
                  {idea?.searchVolume && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">月搜索量</span>
                      <span className="font-semibold text-blue-600">{idea.searchVolume.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            {/* Brief Ingredients Tags */}
            {report.briefIngredients && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-500">核心成分</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    {report.briefIngredients.split(",").map((ing, i) => (
                      <span key={i} className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                        {ing.trim()}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Row 2: Ingredient Efficacy Details (from keyIngredients markdown) */}
          {report.keyIngredients && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-500">成分功效详解</CardTitle>
              </CardHeader>
              <CardContent>
                <MarkdownBlock content={report.keyIngredients} />
              </CardContent>
            </Card>
          )}

          {/* Row 3: Target Market & Audience (from marketAnalysis) */}
          {report.marketAnalysis && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-500">目标市场与消费者</CardTitle>
              </CardHeader>
              <CardContent>
                <MarkdownBlock content={report.marketAnalysis} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Brief CTA */}
      {isBrief && (
        <Card className="border-indigo-100 bg-indigo-50/30">
          <CardContent className="flex flex-col items-center gap-3 p-6 sm:flex-row">
            <Search className="size-8 shrink-0 text-indigo-400" />
            <div className="flex-1 text-center sm:text-left">
              <p className="text-sm font-medium text-slate-700">
                这是一份简报，点击&quot;深度分析&quot;生成完整商业计划
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                包括：产品规格、核心成分详解、竞品分析、财务预估、供应商方案、上架策略
              </p>
            </div>
            <Button
              onClick={handleDeepAnalysis}
              disabled={deepLoading}
              className="gap-1.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow hover:from-indigo-600 hover:to-purple-600"
            >
              {deepLoading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              {deepLoading ? "分析中…" : "深度分析"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Deep analysis tabs - only show when phase is deep */}
      {!isBrief && (
        <>
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
                            <p className="text-xs font-medium text-slate-500">{specLabel(k)}</p>
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
                          ["盈亏平衡销量", report.breakEvenUnits ? `${report.breakEvenUnits} 件/月` : null],
                        ]
                          .filter(([, v]) => v)
                          .map(([label, value]) => (
                            <tr key={String(label)} className="border-b last:border-0">
                              <td className="py-3 pr-4 font-medium text-slate-600">{String(label)}</td>
                              <td className="py-3 text-right font-semibold text-slate-900">{String(value)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
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
                {timeline.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">项目时间线</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="relative space-y-0">
                        {timeline.map((item, i) => (
                          <div key={i} className="relative flex gap-4 pb-6 last:pb-0">
                            {i < timeline.length - 1 && (
                              <div className="absolute left-[15px] top-8 h-full w-0.5 bg-indigo-100" />
                            )}
                            <div className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 ring-2 ring-white">
                              {i + 1}
                            </div>
                            <div className="min-w-0 flex-1 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-900">{item.phase}</span>
                                <ChevronRight className="size-3 text-slate-400" />
                                <span className="text-xs font-medium text-indigo-600">{item.duration}</span>
                              </div>
                              <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.detail}</p>
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
        </>
      )}

      {/* ── Bottom Action Bar ────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <Link href="/dashboard/beauty-ideas">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1 size-3" />
            返回列表
          </Button>
        </Link>

        <div className="flex-1" />

        {isBrief && (
          <Button
            onClick={handleDeepAnalysis}
            disabled={deepLoading}
            size="sm"
            className="gap-1.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600"
          >
            {deepLoading ? <Loader2 className="size-3 animate-spin" /> : <Search className="size-3" />}
            深度分析
          </Button>
        )}

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

        {report.ideaId && (
          <Link href={`/dashboard/product-dev/${report.ideaId}`}>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              <Rocket className="size-3" />
              转入产品开发
            </Button>
          </Link>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => exportPDF(report)}
          className="gap-1 text-xs"
        >
          <Download className="size-3" />
          导出 PDF
        </Button>
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
