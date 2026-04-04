/**
 * Shared helpers for the three idea auto-scan modules (beauty / 3C / europe).
 * Three-layer real data pipeline:
 *   1. keyword_research (growth-filtered blue ocean keywords)
 *   2. google_trend (12-week trend verification)
 *   3. Claude product design (based on verified data only)
 */

import type { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";

type McpClient = ReturnType<typeof createSellerspriteMcpClient>;

/* ── extractors ── */

export function extractKwItems(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.items)) return obj.items as Record<string, unknown>[];
  if (Array.isArray(obj.data)) return obj.data as Record<string, unknown>[];
  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    const inner = obj.data as Record<string, unknown>;
    if (Array.isArray(inner.items)) return inner.items as Record<string, unknown>[];
  }
  return [];
}

export function safeNum(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) ? v : null;
}

/* ── Google Trends direction parsing (12-week comparison) ── */

export type TrendDirection = "rising" | "stable" | "declining" | "unknown";

/**
 * Parse Google Trends response and determine direction by comparing
 * the average of the last 12 weeks vs the previous 12 weeks.
 * >20% increase → "rising", >10% decrease → "declining", else → "stable".
 */
export function parseTrendDirection(data: unknown): TrendDirection {
  if (!data || typeof data !== "object") return "unknown";

  const values = extractTrendValues(data);
  if (values.length < 24) {
    // Fallback: if less than 24 points, try 6-point comparison
    if (values.length >= 6) {
      const half = Math.floor(values.length / 2);
      const recent = values.slice(half);
      const prev = values.slice(0, half);
      const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
      const avgPrev = prev.reduce((a, b) => a + b, 0) / prev.length;
      if (avgPrev === 0) return avgRecent > 0 ? "rising" : "unknown";
      const change = (avgRecent - avgPrev) / avgPrev;
      if (change > 0.20) return "rising";
      if (change < -0.10) return "declining";
      return "stable";
    }
    return "unknown";
  }

  const recent12 = values.slice(-12);
  const prev12 = values.slice(-24, -12);
  const avgRecent = recent12.reduce((a, b) => a + b, 0) / 12;
  const avgPrev = prev12.reduce((a, b) => a + b, 0) / 12;

  if (avgPrev === 0) return avgRecent > 0 ? "rising" : "unknown";

  const change = (avgRecent - avgPrev) / avgPrev;
  if (change > 0.20) return "rising";
  if (change < -0.10) return "declining";
  return "stable";
}

function extractTrendValues(obj: unknown, depth = 0): number[] {
  if (depth > 6 || obj == null || typeof obj !== "object") return [];

  if (Array.isArray(obj)) {
    const nums = obj.filter((v): v is number => typeof v === "number");
    if (nums.length >= 6) return nums;
    const extracted: number[] = [];
    for (const item of obj) {
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const v = safeNum(o.value) ?? safeNum(o.score) ?? safeNum(o.interest) ?? safeNum(o.count);
        if (v !== null) extracted.push(v);
      }
    }
    if (extracted.length >= 6) return extracted;
  }

  const o = obj as Record<string, unknown>;
  for (const key of ["values", "data", "timeline", "timelineData", "items", "trend", "trends", "interestOverTime"]) {
    if (o[key]) {
      const result = extractTrendValues(o[key], depth + 1);
      if (result.length >= 6) return result;
    }
  }
  for (const v of Object.values(o)) {
    const result = extractTrendValues(v, depth + 1);
    if (result.length >= 6) return result;
  }
  return [];
}

/* ── Google Trends enrichment ── */

export type EnrichedKwItem = Record<string, unknown> & {
  _trendDirection: TrendDirection;
  _market: string;
};

/**
 * Verify keyword growth via google_trend. Only checks top 10 by search volume
 * to avoid excessive API calls. Filters out "declining" keywords.
 * Returns enriched items sorted: rising > stable > unknown.
 */
export async function enrichWithGoogleTrends(
  kwItems: Record<string, unknown>[],
  marketplace: string,
  mcp: McpClient,
  logPrefix: string,
): Promise<EnrichedKwItem[]> {
  // Sort by searches descending, only verify top 10
  const sorted = [...kwItems].sort((a, b) => (safeNum(b.searches) ?? 0) - (safeNum(a.searches) ?? 0));
  const toVerify = sorted.slice(0, 10);
  const rest = sorted.slice(10);

  const enriched: EnrichedKwItem[] = [];

  for (const kw of toVerify) {
    const keyword = String(kw.keywords ?? kw.keyword ?? "");
    if (!keyword) continue;

    let direction: TrendDirection = "unknown";
    try {
      const gtRes = await mcp.callToolSafe("google_trend", {
        request: { keyword, marketplace },
      });
      if (gtRes.ok) {
        direction = parseTrendDirection(gtRes.data);
      }
    } catch {
      // keep unknown
    }

    // Filter out declining keywords
    if (direction === "declining") {
      console.info(`${logPrefix} ${keyword} → declining ✗ (filtered out)`);
      continue;
    }

    enriched.push({ ...kw, _trendDirection: direction, _market: marketplace });
    console.info(`${logPrefix} ${keyword} → ${direction}`);
  }

  // Add remaining (unverified) keywords as "unknown" — not filtered
  for (const kw of rest) {
    const keyword = String(kw.keywords ?? kw.keyword ?? "");
    if (!keyword) continue;
    enriched.push({ ...kw, _trendDirection: "unknown" as TrendDirection, _market: marketplace });
  }

  // Sort: rising first, then stable, then unknown
  const order: Record<TrendDirection, number> = { rising: 0, stable: 1, unknown: 2, declining: 3 };
  enriched.sort((a, b) => order[a._trendDirection] - order[b._trendDirection]);

  return enriched;
}

/* ── Trend score computation ── */

export function computeTrendScore(kw: EnrichedKwItem, europeMode = false): number {
  const searches = safeNum(kw.searches) ?? 0;
  const products = safeNum(kw.products) ?? 0;
  const sdr = safeNum(kw.supplyDemandRatio) ?? 0;
  const growth = safeNum(kw.searchNearlyCr) ?? safeNum(kw.searches_growth) ?? 0;
  const direction = kw._trendDirection;

  const searchHigh = europeMode ? 3000 : 5000;
  const searchMid = europeMode ? 1000 : 2000;
  const prodLow = europeMode ? 100 : 200;
  const prodMid = europeMode ? 300 : 500;

  let score =
    (searches >= searchHigh ? 25 : searches >= searchMid ? 15 : 5)
    + (sdr >= 5 ? 20 : sdr >= 3 ? 12 : 5)
    + (products < prodLow ? 20 : products < prodMid ? 12 : 5);

  // Growth rate bonus
  if (growth >= 30) score += 15;
  else if (growth >= 10) score += 10;

  // Google Trends bonus
  if (direction === "rising") score += 15;
  else if (direction === "stable") score += 5;

  return Math.min(100, Math.max(1, Math.round(score)));
}

/* ── Build content string for trend record ── */

export function buildTrendContent(kw: EnrichedKwItem, currencySymbol = "$"): string {
  const searches = safeNum(kw.searches) ?? 0;
  const products = safeNum(kw.products) ?? 0;
  const avgRatings = safeNum(kw.avgRatings) ?? 0;
  const sdr = safeNum(kw.supplyDemandRatio) ?? 0;
  const bid = safeNum(kw.bid) ?? 0;
  const growth = safeNum(kw.searchNearlyCr) ?? safeNum(kw.searches_growth) ?? null;
  const dirLabel = kw._trendDirection === "rising" ? "上升↑"
    : kw._trendDirection === "declining" ? "下降↓"
    : kw._trendDirection === "stable" ? "平稳→"
    : "待验证";
  const growthStr = growth !== null ? `，增长率${growth.toFixed(0)}%` : "";
  return `月搜索量${searches.toLocaleString()}${growthStr}，商品数${products}，平均评论${Math.round(avgRatings)}条，供需比${sdr.toFixed(1)}，CPC ${currencySymbol}${bid.toFixed(2)}。Google趋势：${dirLabel}`;
}
