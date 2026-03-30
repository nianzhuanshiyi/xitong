"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  aggregateReviews,
  concentrationToPie,
  extractCategoryInfo,
  extractKeywordRows,
  extractMarketSize,
  extractTopProducts,
  extractTrafficSplit,
  extractTrafficTrendSeries,
  formatInt,
  formatUsd,
  type PieSlice,
} from "@/lib/product-analysis/mcp-ui-adapter";
import type { AnalysisResult } from "@/lib/product-analysis/types";

const PIE_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#64748b",
];

export function EmptyData({ message = "暂无数据" }: { message?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 py-12 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function ChartTooltip() {
  return (
    <Tooltip
      contentStyle={{
        borderRadius: 8,
        border: "1px solid #e2e8f0",
        fontSize: 12,
      }}
    />
  );
}

function ConcentrationChart({ slices }: { slices: PieSlice[] }) {
  if (slices.length === 0) return <EmptyData />;
  const useBar = slices.length > 7;
  const data = slices.map((s, i) => ({
    ...s,
    fill: PIE_COLORS[i % PIE_COLORS.length],
  }));

  if (useBar) {
    return (
      <div className="h-[240px] w-full min-w-0 max-w-full sm:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              tick={{ fontSize: 10 }}
              tickFormatter={(v: string) =>
                v.length > 12 ? `${v.slice(0, 12)}…` : v
              }
            />
            <ChartTooltip />
            <Bar dataKey="value" name="占比" radius={[0, 4, 4, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="mx-auto h-[240px] w-full min-w-0 max-w-full sm:h-[280px] sm:max-w-md">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={88}
            paddingAngle={2}
            label={({ name, percent }) =>
              `${String(name).slice(0, 8)}${String(name).length > 8 ? "…" : ""} ${((percent ?? 0) * 100).toFixed(0)}%`
            }
            labelLine={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <ChartTooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MarketAnalysisTab({ market }: { market: AnalysisResult["market"] }) {
  const research = market.research;
  const size = extractMarketSize(research);
  const cat = extractCategoryInfo(research);
  const products = extractTopProducts(research, 10);
  const brandSlices = concentrationToPie(market.brandConc, "其他品牌");
  const sellerSlices = concentrationToPie(market.sellerConc, "其他卖家");

  const hasAny =
    size.monthlySalesUsd != null ||
    size.monthlyUnits != null ||
    cat.name ||
    cat.path ||
    products.length > 0 ||
    brandSlices.length > 0 ||
    sellerSlices.length > 0;

  return (
    <div className="space-y-6">
      {market.errors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">部分接口异常</p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {market.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {!hasAny && market.errors.length === 0 && <EmptyData />}

      {(size.monthlySalesUsd != null || size.monthlyUnits != null) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardDescription>月销售额（估算）</CardDescription>
              <CardTitle className="font-heading text-3xl tabular-nums text-indigo-700">
                {formatUsd(size.monthlySalesUsd)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardDescription>月销量（估算）</CardDescription>
              <CardTitle className="font-heading text-3xl tabular-nums text-violet-700">
                {formatInt(size.monthlyUnits)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {(cat.name || cat.path) && (
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">类目信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            {cat.name && (
              <p>
                <span className="font-medium text-slate-900">类目名称：</span>
                {cat.name}
              </p>
            )}
            {cat.path && (
              <p className="break-words">
                <span className="font-medium text-slate-900">类目路径：</span>
                {cat.path}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {products.length > 0 && (
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base">TOP10 商品</CardTitle>
            <CardDescription className="text-xs">按接口返回顺序展示</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0 sm:p-6">
            <table className="w-full min-w-[720px] max-w-full border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-2 py-2 font-semibold">排名</th>
                  <th className="px-2 py-2 font-semibold">图</th>
                  <th className="px-2 py-2 font-semibold">ASIN</th>
                  <th className="px-2 py-2 font-semibold">标题</th>
                  <th className="px-2 py-2 font-semibold">价格</th>
                  <th className="px-2 py-2 font-semibold">评分</th>
                  <th className="px-2 py-2 font-semibold">评论数</th>
                  <th className="px-2 py-2 font-semibold">月销量</th>
                </tr>
              </thead>
              <tbody>
                {products.map((r) => (
                  <tr
                    key={`${r.rank}-${r.asin}`}
                    className="border-b border-slate-100 odd:bg-white even:bg-slate-50/50"
                  >
                    <td className="px-2 py-2 tabular-nums">{r.rank}</td>
                    <td className="px-2 py-1">
                      {r.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.image}
                          alt=""
                          className="size-10 rounded-md border border-slate-200 object-cover"
                        />
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 font-mono text-[11px]">{r.asin}</td>
                    <td className="max-w-[200px] px-2 py-2 text-slate-700 sm:max-w-xs">
                      <span className="line-clamp-2">{r.title}</span>
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {r.price != null ? `$${r.price.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {r.rating != null ? r.rating.toFixed(1) : "—"}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{formatInt(r.reviews)}</td>
                    <td className="px-2 py-2 tabular-nums">{formatInt(r.monthlySales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">品牌集中度</CardTitle>
          </CardHeader>
          <CardContent>
            <ConcentrationChart slices={brandSlices} />
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">卖家集中度</CardTitle>
          </CardHeader>
          <CardContent>
            <ConcentrationChart slices={sellerSlices} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function TrafficAnalysisTab({ result }: { result: AnalysisResult }) {
  const kw = extractKeywordRows(result.traffic.keyword, 20);
  const split = extractTrafficSplit(result.traffic.source, result.traffic.listing);
  const trend = extractTrafficTrendSeries(
    result.traffic.listing,
    result.trends.googleTrend,
    result.trends.chartBsr,
    result.trends.chartPrice
  );

  const pieData =
    split != null && (split.organic > 0 || split.paid > 0)
      ? [
          { name: "自然流量", value: Math.max(0, split.organic), fill: PIE_COLORS[0] },
          { name: "付费流量", value: Math.max(0, split.paid), fill: PIE_COLORS[4] },
        ]
      : [];

  return (
    <div className="space-y-6">
      {result.traffic.errors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <ul className="list-inside list-disc text-xs">
            {result.traffic.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <Card className="border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm sm:text-base">搜索关键词 TOP20</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 sm:p-6">
          {kw.length === 0 ? (
            <EmptyData />
          ) : (
            <table className="w-full min-w-[520px] max-w-full border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-3 py-2 font-semibold">关键词</th>
                  <th className="px-3 py-2 font-semibold">搜索量</th>
                  <th className="px-3 py-2 font-semibold">竞争度</th>
                  <th className="px-3 py-2 font-semibold">排名</th>
                </tr>
              </thead>
              <tbody>
                {kw.map((r, idx) => (
                  <tr
                    key={`${idx}-${r.keyword}`}
                    className="border-b border-slate-100 odd:bg-white even:bg-slate-50/50"
                  >
                    <td className="px-3 py-2 font-medium text-slate-800">{r.keyword}</td>
                    <td className="px-3 py-2 tabular-nums">{formatInt(r.searchVolume)}</td>
                    <td className="px-3 py-2">
                      {r.competition == null
                        ? "—"
                        : typeof r.competition === "number"
                          ? r.competition.toFixed(2)
                          : r.competition}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatInt(r.rank)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">自然 vs 付费流量</CardTitle>
            <CardDescription>占比（按接口可解析字段）</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <EmptyData />
            ) : (
              <div className="mx-auto h-[220px] w-full min-w-0 max-w-full sm:h-[260px] sm:max-w-sm">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={56}
                      outerRadius={88}
                      paddingAngle={2}
                      label={({ name, percent }) =>
                        `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                    >
                      {pieData.map((e, i) => (
                        <Cell key={i} fill={e.fill} />
                      ))}
                    </Pie>
                    <ChartTooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">流量 / 趋势</CardTitle>
            <CardDescription>关键词趋势或 BSR/价格走势（启发式）</CardDescription>
          </CardHeader>
          <CardContent>
            {trend.length < 2 ? (
              <EmptyData />
            ) : (
              <div className="h-[220px] w-full min-w-0 max-w-full sm:h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} width={44} />
                    <ChartTooltip />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={false}
                      name="数值"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function ReviewsAnalysisTab({ result }: { result: AnalysisResult }) {
  const agg = aggregateReviews(result.reviews.byAsin);
  const negList =
    agg.negativeKeywords.length > 0
      ? agg.negativeKeywords
      : result.ai.painPoints.map((p) => p.point).filter(Boolean);

  const totalGB = agg.good + agg.bad;
  const pieData =
    totalGB > 0
      ? [
          { name: "好评", value: agg.good, fill: "#22c55e" },
          { name: "差评", value: agg.bad, fill: "#ef4444" },
        ]
      : [];

  const starHasData = agg.starBuckets.some((b) => b.count > 0);
  const barData = agg.starBuckets.map((b) => ({
    star: `${b.star} 星`,
    count: b.count,
  }));

  const hasReviewPayload = Object.keys(result.reviews.byAsin).length > 0;
  const showEmpty =
    !hasReviewPayload &&
    pieData.length === 0 &&
    !starHasData &&
    negList.length === 0;

  return (
    <div className="space-y-6">
      {result.ai.painPoints.length > 0 && (
        <Card className="max-w-full border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">AI 提炼痛点</CardTitle>
          </CardHeader>
          <CardContent className="max-w-full">
            <ul className="max-w-full list-inside list-decimal space-y-2 text-sm text-slate-700">
              {result.ai.painPoints.map((p, i) => (
                <li key={i}>
                  <span className="font-medium">{p.point}</span>
                  {p.severity && (
                    <span className="text-muted-foreground"> · 严重度 {p.severity}</span>
                  )}
                  {p.frequency && (
                    <span className="text-muted-foreground"> · 频次 {p.frequency}</span>
                  )}
                </li>
              ))}
            </ul>
            {result.ai.reviewSummary && (
              <p className="mt-4 max-w-full text-sm text-slate-600">{result.ai.reviewSummary}</p>
            )}
          </CardContent>
        </Card>
      )}

      {Object.keys(result.reviews.errors).length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <ul className="list-inside list-disc text-xs">
            {Object.entries(result.reviews.errors).map(([asin, err]) => (
              <li key={asin}>
                {asin}: {err}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showEmpty && <EmptyData />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">好评 / 差评比例</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <EmptyData />
            ) : (
              <div className="mx-auto h-[220px] w-full min-w-0 max-w-full sm:h-[260px] sm:max-w-sm">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={86}
                      label={({ name, percent }) =>
                        `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                    >
                      {pieData.map((e, i) => (
                        <Cell key={i} fill={e.fill} />
                      ))}
                    </Pie>
                    <ChartTooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">评分分布（1–5 星）</CardTitle>
          </CardHeader>
          <CardContent>
            {!starHasData ? (
              <EmptyData />
            ) : (
              <div className="h-[220px] w-full min-w-0 max-w-full sm:h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
                    <XAxis dataKey="star" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} width={40} />
                    <ChartTooltip />
                    <Bar dataKey="count" fill="#8b5cf6" name="数量" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">差评关键词 / 痛点</CardTitle>
          <CardDescription>接口解析与 AI 提炼</CardDescription>
        </CardHeader>
        <CardContent>
          {negList.length === 0 ? (
            <EmptyData />
          ) : (
            <ul className="list-inside list-disc space-y-2 text-sm text-slate-700">
              {negList.map((t, i) => (
                <li key={`${i}-${t.slice(0, 24)}`}>{t}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const DIM_LABEL: Record<string, string> = {
  marketCapacity: "市场容量",
  competition: "竞争格局",
  trafficQuality: "流量质量",
  profit: "利润潜力",
  productDifficulty: "产品难度",
  reviewBarrier: "评论壁垒",
  trend: "趋势方向",
  adCost: "推广成本",
};

const DIM_MAX: Record<string, number> = {
  marketCapacity: 12,
  competition: 18,
  trafficQuality: 12,
  profit: 18,
  productDifficulty: 8,
  reviewBarrier: 8,
  trend: 8,
  adCost: 16,
};

const SCORE_COLOR: Record<string, string> = {
  strong: "#059669",
  moderate: "#d97706",
  careful: "#ea580c",
  avoid: "#dc2626",
};

export function ScoreAnalysisTab({ score }: { score: AnalysisResult["score"] }) {
  const total = Math.min(100, Math.max(0, score.total));
  const donutData = [
    { name: "得分", value: total, fill: "#6366f1" },
    { name: "空间", value: 100 - total, fill: "#e2e8f0" },
  ];
  const entries = Object.entries(score.dimensions) as [string, number][];

  return (
    <div className="space-y-10">
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm font-medium text-slate-600">综合得分</p>
        <div className="relative mx-auto h-[200px] w-[200px] min-w-0 sm:h-[240px] sm:w-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={donutData}
                dataKey="value"
                cx="50%"
                cy="50%"
                innerRadius={72}
                outerRadius={100}
                startAngle={90}
                endAngle={-270}
                stroke="none"
              >
                {donutData.map((e, i) => (
                  <Cell key={i} fill={e.fill} />
                ))}
              </Pie>
              <ChartTooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-2">
            <span
              className="font-heading text-5xl font-bold tabular-nums"
              style={{ color: SCORE_COLOR[score.band] ?? "#4f46e5" }}
            >
              {total}
            </span>
            <span className="mt-1 max-w-[140px] text-center text-xs font-medium text-slate-600">
              {score.label}
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl space-y-5 px-1">
        {entries.map(([k, v]) => {
          const max = DIM_MAX[k] ?? 20;
          const pct = Math.min(100, Math.max(0, (v / max) * 100));
          return (
            <div
              key={k}
              className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5"
            >
              <div className="w-40 shrink-0 text-sm font-medium text-slate-700">
                {DIM_LABEL[k] ?? k}
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-sm font-mono tabular-nums text-slate-800">
                  {v}/{max}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {score.rationale && (
        <p className="mx-auto max-w-2xl px-2 text-center text-sm leading-relaxed text-slate-600">
          {score.rationale}
        </p>
      )}
    </div>
  );
}

export function ProfitAnalysisTab({ profit }: { profit: AnalysisResult["profit"] }) {
  const { assumptions, breakdown, scenarios, breakEvenUnitsHint } = profit;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-emerald-200/80 bg-emerald-50/40 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>净利润（主 ASIN 参考价）</CardDescription>
            <CardTitle
              className={`font-heading text-3xl tabular-nums ${breakdown.netProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}
            >
              ${breakdown.netProfit.toFixed(2)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-indigo-200/80 bg-indigo-50/40 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>利润率</CardDescription>
            <CardTitle className="font-heading text-3xl tabular-nums text-indigo-700">
              {breakdown.marginPct.toFixed(1)}%
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">成本拆解</CardTitle>
        </CardHeader>
        <CardContent className="max-w-full space-y-6 text-sm">
          <div className="max-w-full overflow-x-auto rounded-lg border border-slate-300">
            <table className="w-full min-w-0 max-w-full border-collapse text-left text-sm">
              <tbody>
                <tr className="border-b border-slate-200 odd:bg-white even:bg-slate-50">
                  <th className="border-r border-slate-200 px-3 py-2.5 font-medium text-slate-800">
                    售价
                  </th>
                  <td className="px-3 py-2.5">${assumptions.sellingPrice.toFixed(2)}</td>
                </tr>
                <tr className="border-b border-slate-200 odd:bg-white even:bg-slate-50">
                  <th className="border-r border-slate-200 px-3 py-2.5 font-medium">采购</th>
                  <td className="px-3 py-2.5">- ${assumptions.purchaseCost.toFixed(2)}</td>
                </tr>
                <tr className="border-b border-slate-200 odd:bg-white even:bg-slate-50">
                  <th className="border-r border-slate-200 px-3 py-2.5 font-medium">头程</th>
                  <td className="px-3 py-2.5">- ${assumptions.firstMile.toFixed(2)}</td>
                </tr>
                <tr className="border-b border-slate-200 odd:bg-white even:bg-slate-50">
                  <th className="border-r border-slate-200 px-3 py-2.5 font-medium">
                    FBA 估算
                  </th>
                  <td className="px-3 py-2.5">- ${assumptions.fbaEstimate.toFixed(2)}</td>
                </tr>
                <tr className="border-b border-slate-200 odd:bg-white even:bg-slate-50">
                  <th className="border-r border-slate-200 px-3 py-2.5 font-medium">佣金</th>
                  <td className="px-3 py-2.5">
                    - ${breakdown.referralFee.toFixed(2)}（
                    {(assumptions.referralPct * 100).toFixed(0)}%）
                  </td>
                </tr>
                <tr className="border-b border-slate-200 odd:bg-white even:bg-slate-50">
                  <th className="border-r border-slate-200 px-3 py-2.5 font-medium">广告</th>
                  <td className="px-3 py-2.5">
                    - ${breakdown.adCost.toFixed(2)}（{(assumptions.adPct * 100).toFixed(0)}%）
                  </td>
                </tr>
                <tr className="border-b border-slate-200 odd:bg-white even:bg-slate-50">
                  <th className="border-r border-slate-200 px-3 py-2.5 font-medium">
                    退货损耗
                  </th>
                  <td className="px-3 py-2.5">
                    - ${breakdown.returnCost.toFixed(2)}（
                    {(assumptions.returnPct * 100).toFixed(0)}%）
                  </td>
                </tr>
                <tr className="odd:bg-white even:bg-slate-50">
                  <th className="border-r border-slate-200 px-3 py-2.5 font-semibold text-emerald-800">
                    净利润
                  </th>
                  <td className="px-3 py-2.5 font-semibold text-emerald-800">
                    ${breakdown.netProfit.toFixed(2)}（{breakdown.marginPct.toFixed(1)}%）
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="max-w-full">
            <p className="mb-2 font-medium text-slate-900">定价情景</p>
            <div className="max-w-full overflow-x-auto rounded-lg border border-slate-300">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-300 bg-slate-100">
                    <th className="border-r border-slate-300 px-3 py-2 font-semibold text-slate-800">
                      情景
                    </th>
                    <th className="border-r border-slate-300 px-3 py-2 font-semibold">售价</th>
                    <th className="border-r border-slate-300 px-3 py-2 font-semibold">净利</th>
                    <th className="px-3 py-2 font-semibold">利润率</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((s) => (
                    <tr
                      key={s.label}
                      className="border-b border-slate-200 odd:bg-white even:bg-slate-50 last:border-0"
                    >
                      <td className="border-r border-slate-200 px-3 py-2.5">{s.label}</td>
                      <td className="border-r border-slate-200 px-3 py-2.5 font-mono tabular-nums">
                        ${s.sellingPrice.toFixed(2)}
                      </td>
                      <td className="border-r border-slate-200 px-3 py-2.5 font-mono tabular-nums">
                        ${s.netProfit.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 font-mono tabular-nums">
                        {s.marginPct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Card className="border-slate-200 bg-slate-50/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">盈亏平衡分析</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-700">
              {breakEvenUnitsHint ? (
                <p>{breakEvenUnitsHint}</p>
              ) : (
                <EmptyData message="暂无盈亏平衡说明" />
              )}
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}
