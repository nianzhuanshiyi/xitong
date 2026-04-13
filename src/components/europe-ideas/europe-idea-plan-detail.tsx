"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  DollarSign,
  Globe,
  Loader2,
  Rocket,
  Search,
  ShieldAlert,
  TrendingUp,
  FileCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Plan = {
  id: string;
  reportDate: string;
  marketplace: string;
  productName: string;
  productNameEn: string;
  executiveSummary: string;
  selectedKeyword: string;
  searchVolume: number | null;
  supplyDemandRatio: number | null;
  clickConcentration: number | null;
  keywordsData: string;
  qualifiedKeywords: string;
  competitorProducts: string;
  keyFeatures: string;
  designSuggestion: string;
  marketAnalysis: string;
  competitorAnalysis: string;
  differentiationStrategy: string;
  regulatoryNotes: string;
  targetMarket: string;
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
  totalScore: number;
  marketScore: number;
  competitionScore: number;
  trendScore: number;
  profitScore: number;
  recommendation: string;
  competitionLevel: string;
  status: string;
  createdAt: string;
};

type TimelineItem = { phase: string; duration: string; detail: string };
type KeywordResult = {
  keyword: string;
  searches: number | null;
  sdr: number | null;
  monopolyClickRate: number | null;
  passed: boolean;
  failReasons: string[];
};

const MARKETPLACE_LABELS: Record<string, string> = {
  DE: "🇩🇪 德国",
  FR: "🇫🇷 法国",
  UK: "🇬🇧 英国",
  IT: "🇮🇹 意大利",
  ES: "🇪🇸 西班牙",
};

const TABS = [
  { key: "product", label: "产品方案", icon: Globe },
  { key: "market", label: "市场分析", icon: TrendingUp },
  { key: "competitors", label: "竞品数据", icon: Search },
  { key: "compliance", label: "欧盟合规", icon: FileCheck },
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
          return <h3 key={i} className="mb-2 mt-4 text-base font-semibold text-slate-900">{line.slice(4)}</h3>;
        if (line.startsWith("## "))
          return <h2 key={i} className="mb-2 mt-5 text-lg font-bold text-slate-900">{line.slice(3)}</h2>;
        if (line.startsWith("# "))
          return <h1 key={i} className="mb-2 mt-5 text-xl font-bold text-slate-900">{line.slice(2)}</h1>;
        if (line.startsWith("- **") && line.includes("**:"))
          return (
            <p key={i} className="mb-1 text-sm">
              <strong className="font-semibold text-slate-800">{line.slice(2, line.indexOf("**:") + 1).trim()}</strong>:
              {line.slice(line.indexOf("**:") + 3)}
            </p>
          );
        if (line.startsWith("- "))
          return <p key={i} className="mb-1 text-sm text-slate-600">• {line.slice(2)}</p>;
        if (line.startsWith("**") && line.endsWith("**"))
          return <p key={i} className="mb-1 font-bold text-sm text-slate-800">{line.slice(2, -2)}</p>;
        if (line === "")
          return <div key={i} className="my-1" />;
        return <p key={i} className="mb-1 text-sm text-slate-600">{line}</p>;
      })}
    </div>
  );
}

function ScoreBar({ label, score, max = 25 }: { label: string; score: number; max?: number }) {
  const pct = Math.min(100, (score / max) * 100);
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-blue-500" : pct >= 40 ? "bg-amber-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs text-slate-500">{label}</span>
      <div className="flex-1 overflow-hidden rounded-full bg-slate-100 h-2">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 text-right text-xs font-semibold text-slate-700">{score}/{max}</span>
    </div>
  );
}

export function EuropeIdeaPlanDetail({ planId }: { planId: string }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("product");

  const loadPlan = useCallback(async () => {
    try {
      const r = await fetch(`/api/europe-ideas/plans/${planId}`);
      const j = await r.json();
      setPlan(j.plan ?? null);
    } catch { /* ignore */ }
    setLoading(false);
  }, [planId]);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="py-20 text-center">
        <p className="text-slate-500">方案不存在</p>
        <Link href="/dashboard/europe-ideas">
          <Button variant="outline" className="mt-4 gap-2">
            <ArrowLeft className="size-4" /> 返回列表
          </Button>
        </Link>
      </div>
    );
  }

  const rec = REC_CONFIG[plan.recommendation] ?? REC_CONFIG.watch;

  let timeline: TimelineItem[] = [];
  try { timeline = JSON.parse(plan.timelinePlan || "[]"); } catch { timeline = []; }

  let keywords: KeywordResult[] = [];
  try { keywords = JSON.parse(plan.keywordsData || "[]"); } catch { keywords = []; }

  let competitors: Record<string, unknown>[] = [];
  try { competitors = JSON.parse(plan.competitorProducts || "[]"); } catch { competitors = []; }

  const marketplaceLabel = MARKETPLACE_LABELS[plan.marketplace] ?? plan.marketplace;

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link href="/dashboard/europe-ideas" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> 返回欧洲蓝海选品
      </Link>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50/50 to-sky-50/30 p-6 shadow-sm">
        <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-blue-200/20 blur-3xl" aria-hidden />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600">
              欧洲蓝海方案 · {plan.reportDate}
            </p>
            {plan.marketplace && (
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                {marketplaceLabel}
              </span>
            )}
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", rec.color)}>
              {rec.label}
            </span>
            {plan.estimatedMargin && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                利润率 {plan.estimatedMargin}
              </span>
            )}
            {plan.selectedKeyword && (
              <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">
                {plan.selectedKeyword}
              </span>
            )}
          </div>

          <h1 className="font-heading text-2xl font-bold text-slate-900">{plan.productName}</h1>
          {plan.productNameEn && (
            <p className="mt-0.5 text-sm text-slate-500">{plan.productNameEn}</p>
          )}
          {plan.targetMarket && (
            <p className="mt-1 text-xs text-blue-600 font-medium">目标市场：{plan.targetMarket}</p>
          )}
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{plan.executiveSummary}</p>

          {/* Key metrics */}
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-500">
            {plan.estimatedRetailPrice && (
              <div><span className="text-xs text-slate-400">预估售价</span><br /><strong className="text-slate-800">{plan.estimatedRetailPrice}</strong></div>
            )}
            {plan.estimatedCogs && (
              <div><span className="text-xs text-slate-400">成本</span><br /><strong className="text-slate-800">{plan.estimatedCogs}</strong></div>
            )}
            {plan.estimatedProfit && (
              <div><span className="text-xs text-slate-400">单品利润</span><br /><strong className="text-slate-800">{plan.estimatedProfit}</strong></div>
            )}
            {plan.searchVolume && (
              <div><span className="text-xs text-slate-400">月搜索量</span><br /><strong className="text-slate-800">{plan.searchVolume.toLocaleString()}</strong></div>
            )}
            {plan.supplyDemandRatio !== null && plan.supplyDemandRatio !== undefined && (
              <div><span className="text-xs text-slate-400">供需比</span><br /><strong className="text-slate-800">{plan.supplyDemandRatio.toFixed(2)}</strong></div>
            )}
            {plan.clickConcentration !== null && plan.clickConcentration !== undefined && (
              <div><span className="text-xs text-slate-400">点击集中度</span><br /><strong className="text-slate-800">{(plan.clickConcentration * 100).toFixed(0)}%</strong></div>
            )}
          </div>

          {/* Score bars */}
          <div className="mt-5 space-y-2">
            <p className="text-xs font-semibold text-slate-500 mb-2">综合评分 {plan.totalScore}/100</p>
            <ScoreBar label="市场机会" score={plan.marketScore} />
            <ScoreBar label="竞争难度" score={plan.competitionScore} />
            <ScoreBar label="垄断程度" score={plan.trendScore} />
            <ScoreBar label="利润空间" score={plan.profitScore} />
          </div>
        </div>
      </div>

      {/* Keyword Screening */}
      {keywords.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Search className="size-4 text-blue-500" />
              品类筛选过程
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-2 text-[11px] font-semibold text-slate-400 px-1 mb-2">
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
                    kw.passed ? "bg-emerald-50" : "bg-slate-50"
                  )}
                >
                  <span className="font-medium text-slate-700 truncate">{kw.keyword}</span>
                  <span className={cn("text-center", kw.searches !== null && kw.searches >= 3000 ? "text-emerald-700 font-semibold" : "text-red-600")}>
                    {kw.searches !== null ? kw.searches.toLocaleString() : "—"}
                  </span>
                  <span className={cn("text-center", kw.sdr !== null && kw.sdr >= 0.4 ? "text-emerald-700 font-semibold" : kw.sdr !== null ? "text-red-600" : "text-slate-400")}>
                    {kw.sdr !== null ? kw.sdr.toFixed(2) : "—"}
                  </span>
                  <span className={cn("text-center", kw.monopolyClickRate !== null && kw.monopolyClickRate <= 0.45 ? "text-emerald-700 font-semibold" : kw.monopolyClickRate !== null ? "text-red-600" : "text-slate-400")}>
                    {kw.monopolyClickRate !== null ? `${(kw.monopolyClickRate * 100).toFixed(0)}%` : "—"}
                  </span>
                  <span className={cn("text-center text-[10px] font-semibold rounded-full px-2 py-0.5", kw.passed ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                    {kw.passed ? "✓ 通过" : "✗ 未通过"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
              activeTab === key
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-600 hover:text-slate-800"
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "product" && (
        <Card>
          <CardHeader><CardTitle className="text-base">产品方案</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            {plan.keyFeatures && (
              <div>
                <h3 className="mb-3 text-sm font-bold text-slate-700">核心功能</h3>
                <MarkdownBlock content={plan.keyFeatures} />
              </div>
            )}
            {plan.designSuggestion && (
              <div className="border-t pt-4">
                <MarkdownBlock content={plan.designSuggestion} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "market" && (
        <Card>
          <CardHeader><CardTitle className="text-base">欧洲市场分析</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            {plan.marketAnalysis && <MarkdownBlock content={plan.marketAnalysis} />}
            {plan.differentiationStrategy && (
              <div className="border-t pt-4">
                <MarkdownBlock content={plan.differentiationStrategy} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "competitors" && (
        <Card>
          <CardHeader><CardTitle className="text-base">竞品分析</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {plan.competitorAnalysis && (
              <div>
                <MarkdownBlock content={plan.competitorAnalysis} />
              </div>
            )}
            {competitors.length > 0 && (
              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-slate-500 mb-3">
                  卖家精灵筛选竞品（价格€15-50 / 月销≥100 / 月收入≥€2,000 / 评论20-3,000）
                </p>
                <div className="space-y-2">
                  {competitors.map((p, i) => {
                    const title = String(p.title || p.name || p.productTitle || "—");
                    const asin = String(p.asin || "");
                    const price = typeof p.price === "number" ? `€${p.price.toFixed(2)}` : (p.price || "—");
                    const sales = typeof p.monthlySales === "number" ? p.monthlySales.toLocaleString() : (p.salesVolume || p.monthSales || "—");
                    const reviews = typeof p.reviews === "number" ? p.reviews.toLocaleString() : (p.reviewCount || "—");
                    const marketplaceCode = plan.marketplace === "UK" ? "co.uk" : plan.marketplace === "DE" ? "de" : plan.marketplace === "FR" ? "fr" : plan.marketplace === "IT" ? "it" : "es";
                    return (
                      <div key={i} className="flex items-start gap-3 rounded-lg border border-slate-100 p-3 text-xs">
                        <span className="shrink-0 size-6 rounded-full bg-blue-100 text-blue-600 font-bold flex items-center justify-center text-[11px]">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 line-clamp-1">{title}</p>
                          {asin && (
                            <a
                              href={`https://www.amazon.${marketplaceCode}/dp/${asin}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-400 hover:text-blue-600 inline-flex items-center gap-0.5"
                            >
                              {asin} <ChevronRight className="size-3" />
                            </a>
                          )}
                        </div>
                        <div className="shrink-0 flex gap-4 text-slate-500">
                          <span>价格 {String(price)}</span>
                          <span>月销 {String(sales)}</span>
                          <span>评论 {String(reviews)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "compliance" && (
        <Card>
          <CardHeader><CardTitle className="text-base">欧盟合规要求</CardTitle></CardHeader>
          <CardContent>
            {plan.regulatoryNotes ? (
              <MarkdownBlock content={plan.regulatoryNotes} />
            ) : (
              <p className="text-sm text-slate-400">暂无合规说明</p>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "finance" && (
        <Card>
          <CardHeader><CardTitle className="text-base">财务预估（欧元）</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-4">
              {[
                { label: "预估售价", value: plan.estimatedRetailPrice },
                { label: "成本（不含FBA）", value: plan.estimatedCogs },
                { label: "FBA 费用", value: plan.estimatedFbaFee },
                { label: "广告成本", value: plan.estimatedAdCost },
                { label: "单品利润", value: plan.estimatedProfit },
                { label: "毛利率", value: plan.estimatedMargin },
              ].filter(({ value }) => value).map(({ label, value }) => (
                <div key={label} className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className="mt-1 text-lg font-bold text-slate-800">{value}</p>
                </div>
              ))}
            </div>
            {plan.breakEvenUnits && (
              <p className="text-sm text-slate-600">
                盈亏平衡：约 <strong>{plan.breakEvenUnits}</strong> 件
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "execution" && (
        <div className="space-y-4">
          {plan.supplierPlan && (
            <Card>
              <CardHeader><CardTitle className="text-sm">供应商方案</CardTitle></CardHeader>
              <CardContent><MarkdownBlock content={plan.supplierPlan} /></CardContent>
            </Card>
          )}
          {plan.listingPlan && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Listing 策略（多语言）</CardTitle></CardHeader>
              <CardContent><MarkdownBlock content={plan.listingPlan} /></CardContent>
            </Card>
          )}
          {plan.launchStrategy && (
            <Card>
              <CardHeader><CardTitle className="text-sm">上架策略</CardTitle></CardHeader>
              <CardContent><MarkdownBlock content={plan.launchStrategy} /></CardContent>
            </Card>
          )}
          {timeline.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">时间规划</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {timeline.map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="shrink-0 size-6 rounded-full bg-blue-100 flex items-center justify-center text-[11px] font-bold text-blue-600">
                        {i + 1}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {item.phase} <span className="text-slate-400 font-normal">· {item.duration}</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "risk" && (
        <Card>
          <CardHeader><CardTitle className="text-base">风险评估</CardTitle></CardHeader>
          <CardContent>
            {plan.riskAssessment ? (
              <MarkdownBlock content={plan.riskAssessment} />
            ) : (
              <p className="text-sm text-slate-400">暂无风险评估</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
