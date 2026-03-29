"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Trend = {
  id: string;
  source: string;
  market: string;
  title: string;
  content: string;
  ingredients: string[];
  category: string;
  trendScore: number;
  sourceUrl: string | null;
  scannedAt: string;
  createdAt: string;
  ideaCount: number;
};

const MARKET_LABELS: Record<string, { label: string; flag: string }> = {
  US: { label: "美国", flag: "🇺🇸" },
  KR: { label: "韩国", flag: "🇰🇷" },
  CN: { label: "中国", flag: "🇨🇳" },
};

const SOURCE_LABELS: Record<string, string> = {
  google_trends: "Google Trends",
  social_media: "社交媒体",
  news: "新闻资讯",
  industry_report: "行业报告",
};

export function BeautyTrends() {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMarket, setFilterMarket] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterMarket) params.set("market", filterMarket);
      const r = await fetch(`/api/beauty-ideas/trends?${params}`);
      const j = await r.json();
      setTrends(j.trends ?? []);
    } catch { toast.error("加载失败"); }
    finally { setLoading(false); }
  }, [filterMarket]);

  useEffect(() => { load(); }, [load]);

  const markets = filterMarket ? [filterMarket] : ["US", "KR", "CN"];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/beauty-ideas" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> 返回
        </Link>
        <h2 className="text-lg font-semibold">美妆趋势</h2>
        <div className="ml-auto flex gap-2">
          {["", "US", "KR", "CN"].map((m) => (
            <button
              key={m}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition",
                filterMarket === m ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
              onClick={() => setFilterMarket(m)}
            >
              {m ? `${MARKET_LABELS[m]?.flag} ${MARKET_LABELS[m]?.label}` : "全部"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="size-8 animate-spin text-slate-400" /></div>
      ) : trends.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-slate-500">暂无趋势数据</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {markets.map((market) => {
            const items = trends.filter((t) => t.market === market);
            if (items.length === 0) return null;
            const mi = MARKET_LABELS[market] ?? { label: market, flag: "" };
            return (
              <div key={market}>
                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <span>{mi.flag}</span> {mi.label}市场
                  <span className="ml-auto text-xs font-normal text-slate-400">{items.length} 条</span>
                </h3>
                <div className="space-y-3">
                  {items.map((t) => (
                    <Card key={t.id}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-medium text-slate-900">{t.title}</h4>
                          <span className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                            t.trendScore >= 70 ? "bg-emerald-100 text-emerald-700" :
                            t.trendScore >= 40 ? "bg-amber-100 text-amber-700" :
                            "bg-slate-100 text-slate-600"
                          )}>
                            {t.trendScore}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 line-clamp-3">{t.content}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {t.ingredients.slice(0, 4).map((ing, i) => (
                            <span key={i} className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] text-purple-700">{ing}</span>
                          ))}
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
                          <span>{SOURCE_LABELS[t.source] ?? t.source}</span>
                          <span>{new Date(t.scannedAt).toLocaleDateString("zh-CN")}</span>
                          {t.ideaCount > 0 && (
                            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-600">{t.ideaCount} 个创意</span>
                          )}
                          {t.sourceUrl && (
                            <a href={t.sourceUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-indigo-500 hover:underline">
                              <Globe className="size-3" />
                            </a>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
