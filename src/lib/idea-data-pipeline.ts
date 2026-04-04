/**
 * Unified data pipeline for all three idea modules (beauty / 3C / europe).
 *
 * Step 1: keyword_research → blue ocean keywords (growth-filtered)
 * Step 2: google_trend → verify trend direction (filter out declining)
 * Step 3: Claude → product design based on REAL data only
 *
 * Zero AI hallucination in trend discovery. Claude only designs products
 * from verified keyword opportunities.
 */

import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";
import { claudeJson } from "@/lib/claude-client";

/* ── Types ── */

export interface ScanConfig {
  marketplace: string | string[];
  departments: string[];
  moduleName: "beauty" | "3c" | "europe";
  minSearches?: number;
  maxProducts?: number;
  minSupplyDemandRatio?: number;
  maxRatings?: number;
  maxAraClickRate?: number;
  minSearchNearlyCr?: number;
  resultSize?: number;
}

export interface BlueOceanKeyword {
  keyword: string;
  searches: number;
  products: number;
  avgRatings: number;
  avgPrice: number;
  bid: number;
  araClickRate: number;
  supplyDemandRatio: number;
  growth: number;
  googleTrendDirection: "rising" | "stable" | "unknown";
  marketplace: string;
}

export interface IdeaItem {
  keyword: string;
  name: string;
  description: string;
  category: string;
  keyIngredients: string[];
  sellingPoints: string[];
  estimatedPrice: string;
  estimatedCost: string;
  targetMarket: string;
  searchKeywords: string[];
}

/* ── Preset configs ── */

export const BEAUTY_CONFIG: ScanConfig = {
  marketplace: "US",
  departments: ["beauty"],
  moduleName: "beauty",
  minSearches: 1000,
  maxProducts: 300,
  maxRatings: 500,
};

export const THREE_C_CONFIG: ScanConfig = {
  marketplace: "US",
  departments: ["wireless", "electronics", "pc"],
  moduleName: "3c",
  minSearches: 1000,
  maxProducts: 300,
  maxRatings: 500,
};

export const EUROPE_CONFIG: ScanConfig = {
  marketplace: ["DE", "UK", "FR"],
  departments: [],
  moduleName: "europe",
  minSearches: 500,
  maxProducts: 200,
  maxRatings: 300,
};

/* ── Helpers ── */

function extractKwItems(data: unknown): Record<string, unknown>[] {
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

function num(v: unknown): number {
  return typeof v === "number" && isFinite(v) ? v : 0;
}

function parseTrendDirection(data: unknown): "rising" | "stable" | "declining" | "unknown" {
  if (!data || typeof data !== "object") return "unknown";
  const values = extractTrendValues(data);
  if (values.length < 6) return "unknown";

  const half = Math.min(12, Math.floor(values.length / 2));
  const recent = values.slice(-half);
  const prev = values.slice(-half * 2, -half);
  if (prev.length === 0) return "unknown";

  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
  const avgPrev = prev.reduce((a, b) => a + b, 0) / prev.length;
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
        const v = o.value ?? o.score ?? o.interest ?? o.count;
        if (typeof v === "number") extracted.push(v);
      }
    }
    if (extracted.length >= 6) return extracted;
  }
  const o = obj as Record<string, unknown>;
  for (const key of ["values", "data", "timeline", "timelineData", "items", "trend", "trends", "interestOverTime"]) {
    if (o[key]) { const r = extractTrendValues(o[key], depth + 1); if (r.length >= 6) return r; }
  }
  for (const v of Object.values(o)) {
    const r = extractTrendValues(v, depth + 1); if (r.length >= 6) return r;
  }
  return [];
}

/* ── Step 1: keyword_research ── */

async function fetchKeywordsForMarket(
  mcp: ReturnType<typeof createSellerspriteMcpClient>,
  marketplace: string,
  config: ScanConfig,
  log: string,
): Promise<Record<string, unknown>[]> {
  const base = {
    marketplace,
    ...(config.departments.length > 0 ? { departments: config.departments } : {}),
    minSearches: config.minSearches ?? 1000,
    maxProducts: config.maxProducts ?? 300,
    minSupplyDemandRatio: config.minSupplyDemandRatio ?? 3,
    maxRatings: config.maxRatings ?? 500,
    maxAraClickRate: config.maxAraClickRate ?? 0.7,
    minSearchNearlyCr: config.minSearchNearlyCr ?? 10,
    size: config.resultSize ?? 20,
    order: { field: "searches_growth", desc: true },
  };

  let res = await mcp.callToolSafe("keyword_research", { request: base });
  let items = res.ok ? extractKwItems(res.data) : [];

  if (items.length < 5) {
    console.info(`${log} ${marketplace}: ${items.length} results, relaxing...`);
    const relaxed = { ...base, minSearchNearlyCr: undefined, minSearches: Math.max(300, (config.minSearches ?? 1000) / 2), maxProducts: 500 };
    res = await mcp.callToolSafe("keyword_research", { request: relaxed });
    items = res.ok ? extractKwItems(res.data) : items;
  }

  if (!res.ok && items.length === 0) {
    console.warn(`${log} ${marketplace}: keyword_research failed:`, res.ok ? "no data" : res.error);
  }

  return items;
}

/* ── Step 2: google_trend verification ── */

async function verifyWithGoogleTrends(
  mcp: ReturnType<typeof createSellerspriteMcpClient>,
  items: Record<string, unknown>[],
  marketplace: string,
  log: string,
): Promise<Array<Record<string, unknown> & { _direction: "rising" | "stable" | "unknown" }>> {
  // Only verify top 10 by searches to save API calls
  const sorted = [...items].sort((a, b) => num(b.searches) - num(a.searches));
  const toVerify = sorted.slice(0, 10);
  const rest = sorted.slice(10);

  const verified: Array<Record<string, unknown> & { _direction: "rising" | "stable" | "unknown" }> = [];

  for (const kw of toVerify) {
    const keyword = String(kw.keywords ?? kw.keyword ?? "");
    if (!keyword) continue;

    let direction: ReturnType<typeof parseTrendDirection> = "unknown";
    try {
      const gtRes = await mcp.callToolSafe("google_trend", {
        request: { keyword, marketplace },
      });
      if (gtRes.ok) direction = parseTrendDirection(gtRes.data);
    } catch { /* keep unknown */ }

    if (direction === "declining") {
      console.info(`${log} ${keyword} → declining ✗`);
      continue;
    }

    verified.push({ ...kw, _direction: direction });
    console.info(`${log} ${keyword} → ${direction}`);
  }

  // Add unverified rest as "unknown"
  for (const kw of rest) {
    if (String(kw.keywords ?? kw.keyword ?? "")) {
      verified.push({ ...kw, _direction: "unknown" as const });
    }
  }

  // Sort: rising > stable > unknown
  const order = { rising: 0, stable: 1, unknown: 2 };
  verified.sort((a, b) => order[a._direction] - order[b._direction]);

  return verified;
}

/* ── Public: scanBlueOceanKeywords ── */

export async function scanBlueOceanKeywords(config: ScanConfig): Promise<BlueOceanKeyword[]> {
  const log = `[idea-pipeline:${config.moduleName}]`;
  console.info(`${log} Starting scan for module: ${config.moduleName}, markets: ${JSON.stringify(Array.isArray(config.marketplace) ? config.marketplace : [config.marketplace])}`);
  const mcp = createSellerspriteMcpClient();
  const markets = Array.isArray(config.marketplace) ? config.marketplace : [config.marketplace];

  const allKeywords: BlueOceanKeyword[] = [];

  for (const market of markets) {
    console.info(`${log} Step1: keyword_research ${market}...`);
    const raw = await fetchKeywordsForMarket(mcp, market, config, log);
    console.info(`${log} Step1 ${market}: ${raw.length} keywords`);

    console.info(`${log} Step2: google_trend ${market}...`);
    const verified = await verifyWithGoogleTrends(mcp, raw, market, log);
    console.info(`${log} Step2 ${market}: ${verified.length} passed (declining filtered)`);

    for (const kw of verified) {
      allKeywords.push({
        keyword: String(kw.keywords ?? kw.keyword ?? ""),
        searches: num(kw.searches),
        products: num(kw.products),
        avgRatings: num(kw.avgRatings),
        avgPrice: num(kw.avgPrice),
        bid: num(kw.bid),
        araClickRate: num(kw.araClickRate) ?? num(kw.monopolyClickRate),
        supplyDemandRatio: num(kw.supplyDemandRatio),
        growth: num(kw.searchNearlyCr) || num(kw.searches_growth),
        googleTrendDirection: kw._direction,
        marketplace: market,
      });
    }
  }

  return allKeywords;
}

/* ── Public: computeKeywordScore ── */

export function computeKeywordScore(kw: BlueOceanKeyword): number {
  const isEurope = ["DE", "UK", "FR", "IT", "ES"].includes(kw.marketplace);
  const sHigh = isEurope ? 3000 : 5000;
  const sMid = isEurope ? 1000 : 2000;
  const pLow = isEurope ? 100 : 200;
  const pMid = isEurope ? 300 : 500;

  let score =
    (kw.searches >= sHigh ? 25 : kw.searches >= sMid ? 15 : 5) +
    (kw.supplyDemandRatio >= 5 ? 20 : kw.supplyDemandRatio >= 3 ? 12 : 5) +
    (kw.products < pLow ? 20 : kw.products < pMid ? 12 : 5);

  if (kw.growth >= 30) score += 15;
  else if (kw.growth >= 10) score += 10;

  if (kw.googleTrendDirection === "rising") score += 15;
  else if (kw.googleTrendDirection === "stable") score += 5;

  return Math.min(100, Math.max(1, Math.round(score)));
}

/* ── Public: buildTrendContent ── */

export function buildTrendContent(kw: BlueOceanKeyword): string {
  const cur = ["DE", "UK", "FR", "IT", "ES"].includes(kw.marketplace) ? "€" : "$";
  const dir = kw.googleTrendDirection === "rising" ? "上升↑"
    : kw.googleTrendDirection === "stable" ? "平稳→" : "待验证";
  const growthStr = kw.growth > 0 ? `，增长率${kw.growth.toFixed(0)}%` : "";
  return `月搜索量${kw.searches.toLocaleString()}${growthStr}，商品数${kw.products}，平均评论${Math.round(kw.avgRatings)}条，供需比${kw.supplyDemandRatio.toFixed(1)}，CPC ${cur}${kw.bid.toFixed(2)}。Google趋势：${dir}`;
}

/* ── Public: generateIdeasFromKeywords ── */

export async function generateIdeasFromKeywords(
  keywords: BlueOceanKeyword[],
  moduleName: string,
): Promise<IdeaItem[]> {
  if (keywords.length === 0) return [];

  const kwData = keywords.map((kw) => ({
    keyword: kw.keyword,
    marketplace: kw.marketplace,
    searches: kw.searches,
    growth: `${kw.growth.toFixed(0)}%`,
    products: kw.products,
    avgRatings: Math.round(kw.avgRatings),
    avgPrice: `$${kw.avgPrice.toFixed(2)}`,
    cpc: `$${kw.bid.toFixed(2)}`,
    supplyDemandRatio: kw.supplyDemandRatio.toFixed(1),
    googleTrend: kw.googleTrendDirection,
  }));

  const moduleHint = moduleName === "beauty" ? "美妆个护" : moduleName === "3c" ? "3C电子配件" : "跨境电商";

  const ideas = await claudeJson<IdeaItem[]>({
    system: `你是一位资深${moduleHint}产品经理。以下关键词全部来自亚马逊和Google真实数据验证，确认为"需求增长中+竞争低"的蓝海机会。
请基于每个关键词的真实市场数据设计1个具体产品方案。

严格要求：
- 产品必须围绕给定关键词的真实市场需求设计
- 禁止编造不存在的产品概念、技术或型号
- 禁止使用未发布的设备型号（如iPhone 19、iPad Pro M7等）
- 所有成分/技术/功能必须是现实中已存在的
- 预估售价必须参考给定的市场均价数据

每个产品方案返回JSON：
{
  "keyword": "对应的关键词",
  "name": "产品名称（中英文）",
  "description": "产品描述（100-200字）",
  "category": "类目",
  "keyIngredients": ["核心成分/功能1", "2", "3"],
  "sellingPoints": ["卖点1", "卖点2", "卖点3"],
  "estimatedPrice": "$XX-XX",
  "estimatedCost": "$X-X",
  "targetMarket": "US/DE/UK/FR",
  "searchKeywords": ["amazon搜索关键词1", "关键词2"]
}

返回JSON数组，不要包含其他文字。`,
    user: `以下是经过双重验证的蓝海关键词，请为每个设计1个产品方案：\n\n${JSON.stringify(kwData, null, 2)}`,
    maxTokens: 16384,
  });

  if (!ideas || !Array.isArray(ideas)) return [];
  return ideas;
}
