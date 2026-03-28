"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
  strong: "强烈推荐",
  moderate: "可考虑",
  careful: "谨慎",
  avoid: "不建议",
};

export function HistoryList() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);

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

  /** 同一站点 + 主 ASIN 只保留最新一条（避免完整分析同时写入报告与缓存时重复展示） */
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
      {deduped.map((r) => (
        <Card key={`${r.kind}-${r.id}`}>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-2">
            <div className="min-w-0">
              <CardTitle className="text-base">
                {r.kind === "report" ? (
                  <Link
                    href={`/dashboard/product-analysis?id=${r.id}`}
                    className="text-indigo-700 hover:underline"
                  >
                    {r.title ?? "选品分析"}
                  </Link>
                ) : (
                  <Link
                    href={`/dashboard/product-analysis?cacheId=${r.id}`}
                    className="text-indigo-700 hover:underline"
                  >
                    {r.title}
                  </Link>
                )}
              </CardTitle>
              <CardDescription className="break-all font-mono text-xs">
                {r.asins.join(", ")} · {r.marketplace}
              </CardDescription>
            </div>
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
              <Badge variant={r.kind === "cache" ? "secondary" : "outline"}>
                {r.kind === "cache" ? "分析缓存" : "历史报告"}
              </Badge>
              {r.kind === "cache" && r.expired && (
                <Badge variant="destructive" className="text-xs">
                  已过期
                </Badge>
              )}
              {r.score != null && (
                <Badge variant="secondary" className="font-mono">
                  {r.score} 分
                </Badge>
              )}
              {r.kind === "report" && r.scoreBand && (
                <Badge variant="outline">
                  {BAND_CN[r.scoreBand] ?? r.scoreBand}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {r.kind === "report" ? (
              <p>{new Date(r.createdAt).toLocaleString("zh-CN")}</p>
            ) : (
              <p>
                更新 {new Date(r.updatedAt).toLocaleString("zh-CN")} · 分析人{" "}
                {r.analystLabel}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
