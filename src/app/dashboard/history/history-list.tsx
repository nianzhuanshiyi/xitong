"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RotateCw } from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ReportRow = {
  id: string;
  title: string | null;
  marketplace: string;
  asins: string[];
  score: number | null;
  scoreBand: string | null;
  createdAt: string;
};

type CacheRow = {
  id: string;
  asin: string;
  marketplace: string;
  score: number;
  updatedAt: string;
  expiresAt: string;
  expired: boolean;
  analystLabel: string;
};

type ListItem =
  | {
      kind: "report";
      sortAt: string;
      id: string;
      title: string | null;
      marketplace: string;
      asins: string[];
      score: number | null;
      scoreBand: string | null;
      createdAt: string;
    }
  | {
      kind: "cache";
      sortAt: string;
      id: string;
      title: string;
      marketplace: string;
      asins: string[];
      score: number;
      expired: boolean;
      analystLabel: string;
      updatedAt: string;
    };

const BAND_CN: Record<string, string> = {
  strong: "建议进入",
  moderate: "可以考虑",
  careful: "谨慎进入",
  avoid: "不建议进入",
};

const BAND_COLORS: Record<string, { badge: string; score: string }> = {
  strong: { badge: "bg-green-100 text-green-700 border-green-200", score: "text-green-600" },
  moderate: { badge: "bg-blue-100 text-blue-700 border-blue-200", score: "text-blue-600" },
  careful: { badge: "bg-orange-100 text-orange-700 border-orange-200", score: "text-orange-500" },
  avoid: { badge: "bg-red-100 text-red-700 border-red-200", score: "text-red-500" },
};

export function HistoryList() {
  const router = useRouter();
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rReports, rCaches] = await Promise.all([
          fetch("/api/product-analysis/reports"),
          fetch("/api/product-analysis/cache-entries"),
        ]);
        const reports: ReportRow[] = rReports.ok
          ? await rReports.json().catch(() => [])
          : [];
        const caches: CacheRow[] = rCaches.ok
          ? await rCaches.json().catch(() => [])
          : [];

        const merged: ListItem[] = [
          ...reports.map((r) => ({
            kind: "report" as const,
            sortAt: r.createdAt,
            ...r,
          })),
          ...caches.map((c) => ({
            kind: "cache" as const,
            sortAt: c.updatedAt,
            id: c.id,
            title: `分析缓存 · ${c.asin}`,
            marketplace: c.marketplace,
            asins: [c.asin],
            score: c.score,
            expired: c.expired,
            analystLabel: c.analystLabel,
            updatedAt: c.updatedAt,
          })),
        ].sort(
          (a, b) =>
            new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime()
        );

        if (!cancelled) setItems(merged);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** 同一站点 + 主 ASIN 只保留最新一条 */
  const deduped = useMemo(() => {
    const best = new Map<string, ListItem>();
    for (const it of items) {
      const asinKey = [...it.asins].sort().join(",");
      const key = `${it.marketplace}::${asinKey}`;
      const prev = best.get(key);
      if (!prev) {
        best.set(key, it);
        continue;
      }
      const tNew = new Date(it.sortAt).getTime();
      const tOld = new Date(prev.sortAt).getTime();
      if (tNew >= tOld) best.set(key, it);
    }
    return Array.from(best.values()).sort(
      (a, b) =>
        new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime()
    );
  }, [items]);

  const filtered = useMemo(() => {
    if (filter === "all") return deduped;
    return deduped.filter((r) => {
      if (r.kind === "report") return r.scoreBand === filter;
      return false;
    });
  }, [deduped, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: deduped.length, strong: 0, moderate: 0, careful: 0, avoid: 0 };
    for (const r of deduped) {
      if (r.kind === "report" && r.scoreBand && c[r.scoreBand] !== undefined) c[r.scoreBand]++;
    }
    return c;
  }, [deduped]);

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (deduped.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          暂无记录。在「选品分析」运行后，历史报告与团队分析缓存会出现在此处。
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(["all", "strong", "moderate", "careful", "avoid"] as const).map((key) => (
          <Button
            key={key}
            variant={filter === key ? "default" : "outline"}
            size="sm"
            className={filter === key && key !== "all" ? BAND_COLORS[key]?.badge : ""}
            onClick={() => setFilter(key)}
          >
            {key === "all" ? "全部" : BAND_CN[key]} ({counts[key] ?? 0})
          </Button>
        ))}
      </div>

      {filtered.map((r) => {
        const parts = (r.title ?? "选品分析").split(" · ");
        const mainTitle = parts.slice(0, 2).join(" · ");
        const productTag = parts.length >= 3 ? parts.slice(2).join(" · ") : null;
        const band = r.kind === "report" ? r.scoreBand : null;
        const colors = band ? BAND_COLORS[band] : null;
        const hasScore = r.score != null;

        return (
          <Card key={`${r.kind}-${r.id}`} className="hover:shadow-md transition-shadow">
            <CardContent className="flex items-center gap-4 py-4">
              {/* Left: Score */}
              <div className="flex flex-col items-center justify-center w-16 shrink-0">
                {hasScore ? (
                  <>
                    <span className={`text-2xl font-bold ${colors?.score ?? "text-gray-600"}`}>
                      {r.score}
                    </span>
                    <span className="text-[10px] text-muted-foreground">/100</span>
                  </>
                ) : (
                  <>
                    <span className="text-2xl font-bold text-gray-300">—</span>
                    <span className="text-[10px] text-muted-foreground">分析中</span>
                  </>
                )}
              </div>

              {/* Middle: Title + meta */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {r.kind === "report" ? (
                    <Link
                      href={`/dashboard/product-analysis?id=${r.id}`}
                      className="text-sm font-medium text-indigo-700 hover:underline truncate"
                    >
                      {mainTitle}
                    </Link>
                  ) : (
                    <Link
                      href={`/dashboard/product-analysis?cacheId=${r.id}`}
                      className="text-sm font-medium text-indigo-700 hover:underline truncate"
                    >
                      {mainTitle}
                    </Link>
                  )}
                  {productTag && (
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {productTag}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {r.asins.join(", ")} · {r.marketplace} ·{" "}
                  {r.kind === "report"
                    ? new Date(r.createdAt).toLocaleString("zh-CN")
                    : `${new Date(r.updatedAt).toLocaleString("zh-CN")} · ${r.analystLabel}`}
                </p>
              </div>

              {/* Right: Badge + re-analyze */}
              <div className="flex items-center gap-2 shrink-0">
                {band && (
                  <Badge
                    variant="outline"
                    className={`text-xs ${colors?.badge ?? ""}`}
                  >
                    {BAND_CN[band] ?? band}
                  </Badge>
                )}
                {r.kind === "cache" && r.expired && (
                  <Badge variant="destructive" className="text-xs">
                    已过期
                  </Badge>
                )}
                {r.kind === "report" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs text-muted-foreground hover:text-indigo-600"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      router.push(
                        `/dashboard/product-analysis?prefill=${encodeURIComponent(r.asins.join("\n"))}&marketplace=${r.marketplace || "US"}&forceRefresh=1`
                      );
                    }}
                  >
                    <RotateCw className="size-3.5" />
                    重新分析
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
