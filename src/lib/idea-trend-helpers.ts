/**
 * Shared helpers for the three idea auto-scan modules (beauty / 3C / europe).
 * Extracts keyword items, parses Google Trends direction, and computes trend scores.
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

/* ── Google Trends direction parsing ── */

export type TrendDirection = "up" | "stable" | "down" | "unknown";

/**
 * Parse Google Trends response and determine direction by comparing
 * the average of the last 3 data points vs the previous 3 data points.
 * >10% increase → "up", >10% decrease → "down", else → "stable".
 */
export function parseTrendDirection(data: unknown): TrendDirection {
  if (!data || typeof data !== "object") return "unknown";

  // google_trend returns various shapes — try to find a numeric time-series array
  const values = extractTrendValues(data);
  if (values.length < 6) return "unknown";

  const recent3 = values.slice(-3);
  const prev3 = values.slice(-6, -3);
  const avgRecent = recent3.reduce((a, b) => a + b, 0) / 3;
  const avgPrev = prev3.reduce((a, b) => a + b, 0) / 3;

  if (avgPrev === 0) return avgRecent > 0 ? "up" : "unknown";

  const change = (avgRecent - avgPrev) / avgPrev;
  if (change > 0.10) return "up";
  if (change < -0.10) return "down";
  return "stable";
}

function extractTrendValues(obj: unknown, depth = 0): number[] {
  if (depth > 6 || obj == null || typeof obj !== "object") return [];

  // Direct number array
  if (Array.isArray(obj)) {
    const nums = obj.filter((v): v is number => typeof v === "number");
    if (nums.length >= 6) return nums;
    // Array of objects with value/score fields
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
  // Try common keys
  for (const key of ["values", "data", "timeline", "timelineData", "items", "trend", "trends", "interestOverTime"]) {
    if (o[key]) {
      const result = extractTrendValues(o[key], depth + 1);
      if (result.length >= 6) return result;
    }
  }
  // Recurse into all object values
  for (const v of Object.values(o)) {
    const result = extractTrendValues(v, depth + 1);
    if (result.length >= 6) return result;
  }
  return [];
}

/* ── Google Trends enrichment for a list of keyword items ── */

export type EnrichedKwItem = Record<string, unknown> & {
  _trendDirection: TrendDirection;
  _market: string;
};

/**
 * For each keyword item, call google_trend to verify growth direction.
 * Returns the enriched items sorted by priority: up > stable > down.
 * Items with "down" trend are placed last (not removed).
 */
export async function enrichWithGoogleTrends(
  kwItems: Record<string, unknown>[],
  marketplace: string,
  mcp: McpClient,
  logPrefix: string,
): Promise<EnrichedKwItem[]> {
  const enriched: EnrichedKwItem[] = [];

  for (const kw of kwItems) {
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

    enriched.push({ ...kw, _trendDirection: direction, _market: marketplace });
    console.info(`${logPrefix} ${keyword} → Google Trends: ${direction}`);
  }

  // Sort: up first, then stable, then unknown, then down
  const order: Record<TrendDirection, number> = { up: 0, stable: 1, unknown: 2, down: 3 };
  enriched.sort((a, b) => order[a._trendDirection] - order[b._trendDirection]);

  return enriched;
}

/* ── Trend score computation ── */

export function computeTrendScore(kw: EnrichedKwItem, europeMode = false): number {
  const searches = safeNum(kw.searches) ?? 0;
  const products = safeNum(kw.products) ?? 0;
  const sdr = safeNum(kw.supplyDemandRatio) ?? 0;
  const direction = kw._trendDirection;

  const searchThresholdHigh = europeMode ? 3000 : 5000;
  const searchThresholdMid = europeMode ? 1000 : 2000;
  const productThresholdLow = europeMode ? 100 : 200;
  const productThresholdMid = europeMode ? 300 : 500;

  let score =
    (searches >= searchThresholdHigh ? 30 : searches >= searchThresholdMid ? 20 : 10)
    + (sdr >= 5 ? 25 : sdr >= 3 ? 15 : 5)
    + (products < productThresholdLow ? 25 : products < productThresholdMid ? 15 : 5);

  // Google Trends bonus / penalty
  if (direction === "up") score += 15;
  else if (direction === "stable") score += 5;
  else if (direction === "down") score -= 10;

  return Math.min(100, Math.max(1, Math.round(score)));
}

/* ── Build content string for trend record ── */

export function buildTrendContent(kw: EnrichedKwItem, currencySymbol = "$"): string {
  const searches = safeNum(kw.searches) ?? 0;
  const products = safeNum(kw.products) ?? 0;
  const avgRatings = safeNum(kw.avgRatings) ?? 0;
  const sdr = safeNum(kw.supplyDemandRatio) ?? 0;
  const bid = safeNum(kw.bid) ?? 0;
  const dirLabel = kw._trendDirection === "up" ? "上升↑"
    : kw._trendDirection === "down" ? "下降↓"
    : kw._trendDirection === "stable" ? "平稳→"
    : "未知";
  return `月搜索量${searches.toLocaleString()}，商品数${products}，平均评论${Math.round(avgRatings)}条，供需比${sdr.toFixed(1)}，CPC ${currencySymbol}${bid.toFixed(2)}。Google趋势：${dirLabel}`;
}
