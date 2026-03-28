import type { ParsedAsinInput } from "@/lib/asin-parser";

export type ProfitInputForCache = {
  purchaseCost: number;
  firstMile: number;
  fbaEstimate: number;
  referralPct: number;
  adPct: number;
  returnPct: number;
};

/**
 * 同一组 ASIN + 站点 + 利润假设 → 同一缓存键（避免换采购价仍误用旧缓存）。
 */
export function buildAnalysisCacheKey(
  parsed: ParsedAsinInput,
  profit: ProfitInputForCache
): string {
  const asins = [...parsed.asins].sort().join(",");
  const p = [
    profit.purchaseCost,
    profit.firstMile,
    profit.fbaEstimate,
    profit.referralPct,
    profit.adPct,
    profit.returnPct,
  ]
    .map((n) => (Number.isFinite(n) ? n.toFixed(6) : "0"))
    .join("|");
  return `${parsed.marketplace}::${asins}::${p}`;
}
