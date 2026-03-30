import { parseAsinInput } from "@/lib/asin-parser";
import { prisma } from "@/lib/prisma";
import { claudeJson, claudeMessages } from "@/lib/claude-client";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";
import { generateFactorySpecMarkdown } from "@/lib/product-analysis/factory-spec";
import { buildAnalysisCacheKey } from "./cache-key";
import type { AnalysisResult, ScoreBand, StreamProgressEvent } from "./types";
import {
  collectSeries,
  extractNodeId,
  guessPriceFromDetail,
  truncateJson,
} from "./utils";

/** Extract nodeIdPath string (e.g. "3760911:11062741:...") from asin_detail data */
function extractNodeIdPath(obj: unknown, depth = 0): string | null {
  if (depth > 12 || obj == null || typeof obj !== "object") return null;
  if (Array.isArray(obj)) {
    for (const x of obj) {
      const n = extractNodeIdPath(x, depth + 1);
      if (n) return n;
    }
    return null;
  }
  const o = obj as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    if (/^nodeIdPath$/i.test(k) && typeof v === "string" && v.trim()) {
      return v.trim();
    }
  }
  for (const v of Object.values(o)) {
    const n = extractNodeIdPath(v, depth + 1);
    if (n) return n;
  }
  return null;
}

function bandFromTotal(total: number): ScoreBand {
  if (total >= 75) return "strong";
  if (total >= 55) return "moderate";
  if (total >= 35) return "careful";
  return "avoid";
}

function bandLabel(b: ScoreBand): string {
  const m: Record<ScoreBand, string> = {
    strong: "强烈推荐进入",
    moderate: "可以考虑",
    careful: "谨慎评估",
    avoid: "不建议进入",
  };
  return m[b];
}

/* ── 数据驱动评分引擎（7维度） ── */

function clampDim(v: number, max: number) {
  return Math.max(0, Math.min(max, Math.round(v)));
}

function deepNum(obj: unknown, key: string, depth = 0): number | null {
  if (depth > 10 || obj == null || typeof obj !== "object") return null;
  if (Array.isArray(obj)) {
    for (const x of obj) {
      const r = deepNum(x, key, depth + 1);
      if (r !== null) return r;
    }
    return null;
  }
  const o = obj as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    if (k.toLowerCase() === key.toLowerCase() && typeof v === "number") return v;
  }
  for (const v of Object.values(o)) {
    const r = deepNum(v, key, depth + 1);
    if (r !== null) return r;
  }
  return null;
}

function deepNumAny(obj: unknown, keys: string[]): number | null {
  for (const k of keys) {
    const v = deepNum(obj, k);
    if (v !== null) return v;
  }
  return null;
}

function calculateDataDrivenScore(ctx: {
  trafficKeyword: unknown;
  marketResearch: unknown;
  asinDetails: Record<string, unknown>;
  reviewByAsin: Record<string, unknown>;
  keepa: unknown;
  googleTrend: unknown;
  marginPct: number;
  brandKeywords: string[];
  allKeywords: string[];
}): { dimensions: AnalysisResult["score"]["dimensions"]; details: Record<string, string> } {
  const details: Record<string, string> = {};

  // D1: Market Capacity (max 15) — monthly search volume
  const searchVol = deepNumAny(ctx.trafficKeyword, ["searches", "monthlySearchVolume", "searchVolume", "searchesGrowthRate"]);
  let d1 = 8;
  if (searchVol !== null) {
    if (searchVol >= 100000) d1 = 15;
    else if (searchVol >= 50000) d1 = 13;
    else if (searchVol >= 20000) d1 = 11;
    else if (searchVol >= 10000) d1 = 9;
    else if (searchVol >= 5000) d1 = 7;
    else d1 = 5;
    details.marketCapacity = `月搜索量 ${searchVol.toLocaleString()}`;
  } else {
    details.marketCapacity = "搜索量数据缺失，使用默认值";
  }

  // D2: Competition (max 20) — products count, SPR, supply/demand ratio, monopoly click
  const products = deepNumAny(ctx.marketResearch, ["products", "productCount"]);
  const spr = deepNumAny(ctx.marketResearch, ["spr", "supplyDemandRatio"]);
  const monopolyClick = deepNumAny(ctx.marketResearch, ["monopolyClickRate", "clickConcentration"]);
  let d2 = 10;
  const d2Parts: string[] = [];

  if (products !== null) {
    if (products < 200) { d2 += 4; d2Parts.push(`商品数${products}(少)`); }
    else if (products < 500) { d2 += 2; d2Parts.push(`商品数${products}(中)`); }
    else if (products < 1000) { d2 += 0; d2Parts.push(`商品数${products}`); }
    else { d2 -= 3; d2Parts.push(`商品数${products}(多)`); }
  }
  if (spr !== null) {
    if (spr < 3) { d2 += 3; d2Parts.push(`SPR ${spr.toFixed(1)}(低)`); }
    else if (spr < 8) { d2 += 1; d2Parts.push(`SPR ${spr.toFixed(1)}(中)`); }
    else { d2 -= 2; d2Parts.push(`SPR ${spr.toFixed(1)}(高)`); }
  }
  if (monopolyClick !== null) {
    if (monopolyClick < 30) { d2 += 2; d2Parts.push(`垄断点击率${monopolyClick}%(低)`); }
    else if (monopolyClick > 60) { d2 -= 3; d2Parts.push(`垄断点击率${monopolyClick}%(高)`); }
  }
  details.competition = d2Parts.length > 0 ? d2Parts.join("；") : "竞争数据缺失，使用默认值";

  // D3: Traffic Quality (max 15) — brand keyword ratio in top keywords
  let d3 = 8;
  if (ctx.allKeywords.length > 0 && ctx.brandKeywords.length >= 0) {
    const brandCount = ctx.allKeywords.filter((kw) =>
      ctx.brandKeywords.some((bk) => kw.toLowerCase().includes(bk.toLowerCase()))
    ).length;
    const brandRatio = brandCount / ctx.allKeywords.length;
    if (brandRatio < 0.1) { d3 = 14; details.trafficQuality = `品牌词占比${(brandRatio * 100).toFixed(0)}%（极低，流量通用性强）`; }
    else if (brandRatio < 0.3) { d3 = 11; details.trafficQuality = `品牌词占比${(brandRatio * 100).toFixed(0)}%（较低）`; }
    else if (brandRatio < 0.5) { d3 = 7; details.trafficQuality = `品牌词占比${(brandRatio * 100).toFixed(0)}%（中等）`; }
    else { d3 = 4; details.trafficQuality = `品牌词占比${(brandRatio * 100).toFixed(0)}%（高，品牌锁定严重）`; }
  } else {
    details.trafficQuality = "关键词数据不足，使用默认值";
  }

  // D4: Profit (max 20) — based on user margin
  let d4 = 10;
  if (ctx.marginPct >= 35) d4 = 20;
  else if (ctx.marginPct >= 28) d4 = 17;
  else if (ctx.marginPct >= 20) d4 = 14;
  else if (ctx.marginPct >= 12) d4 = 10;
  else if (ctx.marginPct >= 5) d4 = 6;
  else d4 = 3;
  details.profit = `利润率 ${ctx.marginPct.toFixed(1)}%`;

  // D5: Product Difficulty (max 10) — avg ratings count, variation count
  const asins = Object.values(ctx.asinDetails);
  let avgRatings = 0;
  let ratingCount = 0;
  for (const det of asins) {
    const rc = deepNumAny(det, ["ratingsCount", "ratings", "reviewCount", "totalRatings"]);
    if (rc !== null) { avgRatings += rc; ratingCount++; }
  }
  let d5 = 5;
  if (ratingCount > 0) {
    avgRatings /= ratingCount;
    if (avgRatings < 200) { d5 = 9; details.productDifficulty = `竞品平均评论${Math.round(avgRatings)}条（少，易追赶）`; }
    else if (avgRatings < 1000) { d5 = 7; details.productDifficulty = `竞品平均评论${Math.round(avgRatings)}条（中等）`; }
    else if (avgRatings < 5000) { d5 = 4; details.productDifficulty = `竞品平均评论${Math.round(avgRatings)}条（较多）`; }
    else { d5 = 2; details.productDifficulty = `竞品平均评论${Math.round(avgRatings)}条（极多，难追赶）`; }
  } else {
    details.productDifficulty = "评论数据缺失，使用默认值";
  }

  // D6: Review Barrier (max 10) — competitor avg rating & review count
  const ratings: number[] = [];
  for (const det of asins) {
    const r = deepNumAny(det, ["rating", "averageRating", "starRating"]);
    if (r !== null) ratings.push(r);
  }
  let d6 = 5;
  if (ratings.length > 0) {
    const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    if (avgRating < 3.8) { d6 = 9; details.reviewBarrier = `竞品平均评分${avgRating.toFixed(1)}（低，容易超越）`; }
    else if (avgRating < 4.2) { d6 = 7; details.reviewBarrier = `竞品平均评分${avgRating.toFixed(1)}（中等）`; }
    else if (avgRating < 4.5) { d6 = 4; details.reviewBarrier = `竞品平均评分${avgRating.toFixed(1)}（较高）`; }
    else { d6 = 2; details.reviewBarrier = `竞品平均评分${avgRating.toFixed(1)}（极高，难超越）`; }
  } else {
    details.reviewBarrier = "评分数据缺失，使用默认值";
  }

  // D7: Trend (max 10) — google trend & keepa direction
  let d7 = 5;
  const trendParts: string[] = [];
  const gTrendVal = deepNumAny(ctx.googleTrend, ["trendScore", "trend", "interestOverTime"]);
  if (gTrendVal !== null) {
    if (gTrendVal >= 70) { d7 += 2; trendParts.push(`Google趋势${gTrendVal}(上升)`); }
    else if (gTrendVal >= 40) { d7 += 0; trendParts.push(`Google趋势${gTrendVal}(平稳)`); }
    else { d7 -= 2; trendParts.push(`Google趋势${gTrendVal}(下降)`); }
  }
  const keepaSlope = deepNumAny(ctx.keepa, ["salesRankSlope", "bsrSlope", "trend"]);
  if (keepaSlope !== null) {
    // Negative slope = improving BSR = good
    if (keepaSlope < -5) { d7 += 2; trendParts.push("Keepa BSR上升趋势"); }
    else if (keepaSlope > 5) { d7 -= 1; trendParts.push("Keepa BSR下降趋势"); }
  }
  details.trend = trendParts.length > 0 ? trendParts.join("；") : "趋势数据缺失，使用默认值";

  const dimensions = {
    marketCapacity: clampDim(d1, 15),
    competition: clampDim(d2, 20),
    trafficQuality: clampDim(d3, 15),
    profit: clampDim(d4, 20),
    productDifficulty: clampDim(d5, 10),
    reviewBarrier: clampDim(d6, 10),
    trend: clampDim(d7, 10),
  };

  return { dimensions, details };
}

export type ProductAnalysisRunMeta = {
  fromCache: boolean;
  cacheMeta?: {
    updatedAt: string;
    analystLabel: string;
  };
};

export async function runProductAnalysis(
  rawInput: string,
  profitInput: {
    purchaseCost: number;
    firstMile: number;
    fbaEstimate: number;
    referralPct: number;
    adPct: number;
    returnPct: number;
  },
  userId: string,
  onProgress: (e: StreamProgressEvent) => void,
  options?: { forceRefresh?: boolean }
): Promise<{ result: AnalysisResult; reportId: string | null } & ProductAnalysisRunMeta> {
  const p = (step: string, label: string, percent: number) =>
    onProgress({ type: "progress", step, label, percent });

  const parsed = parseAsinInput(rawInput);
  if (parsed.asins.length === 0) {
    throw new Error("未识别到有效 ASIN，请粘贴亚马逊链接或 10 位 ASIN（每行一个）");
  }

  const cacheKey = buildAnalysisCacheKey(parsed, profitInput);

  if (!options?.forceRefresh) {
    const hit = await prisma.analysisCache.findUnique({
      where: { cacheKey },
      include: {
        analyzedBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (hit && hit.expiresAt.getTime() > Date.now()) {
      let result: AnalysisResult;
      try {
        result = JSON.parse(hit.analysisData) as AnalysisResult;
      } catch {
        throw new Error("缓存数据损坏，请点击「重新分析」");
      }
      const analystLabel =
        hit.analyzedBy.name?.trim() ||
        hit.analyzedBy.email?.trim() ||
        "其他用户";
      p("cache", "已命中分析缓存", 100);
      return {
        result,
        reportId: null,
        fromCache: true,
        cacheMeta: {
          updatedAt: hit.updatedAt.toISOString(),
          analystLabel,
        },
      };
    }
  }

  p("parse", "解析 ASIN 与站点", 3);

  const mcp = createSellerspriteMcpClient();

  const byAsin: Record<string, unknown> = {};
  const detailErrors: Record<string, string> = {};
  const lowPriceWarnings: string[] = [];

  for (const asin of parsed.asins) {
    const r = await mcp.callToolSafe("asin_detail", {
      asin,
      marketplace: parsed.marketplace,
    });
    if (r.ok) {
      byAsin[asin] = r.data;
      const price = guessPriceFromDetail(r.data);
      if (price != null && price < 15) {
        lowPriceWarnings.push(
          `${asin} 当前展示价约 $${price.toFixed(2)}，低于 $15 门槛，标红预警：低价类目利润空间可能被压缩，不建议盲目进入。`
        );
      }
    } else {
      detailErrors[asin] = r.error;
    }
  }

  p("basics", "基础数据（asin_detail）", 18);

  const primary = parsed.asins[0];
  const [kw, src, lst] = await Promise.all([
    mcp.callToolSafe("traffic_keyword", {
      request: { asin: primary, marketplace: parsed.marketplace },
    }),
    mcp.callToolSafe("traffic_source", {
      request: { q: primary, marketplace: parsed.marketplace },
    }),
    mcp.callToolSafe("traffic_listing", {
      request: { asinList: [primary], marketplace: parsed.marketplace, relations: ["similar"] },
    }),
  ]);

  const trafficErrors: string[] = [];
  if (!kw.ok) trafficErrors.push(`traffic_keyword: ${kw.error}`);
  if (!src.ok) trafficErrors.push(`traffic_source: ${src.error}`);
  if (!lst.ok) trafficErrors.push(`traffic_listing: ${lst.error}`);

  p("traffic", "流量结构（关键词 / 来源 / Listing）", 32);

  const reviewByAsin: Record<string, unknown> = {};
  const reviewErrors: Record<string, string> = {};
  for (const asin of parsed.asins) {
    const r = await mcp.callToolSafe("review", {
      asin,
      marketplace: parsed.marketplace,
    });
    if (r.ok) reviewByAsin[asin] = r.data;
    else reviewErrors[asin] = r.error;
  }

  p("reviews", "评价与评论内容", 44);

  const nodeId =
    extractNodeId(byAsin[primary]) ??
    extractNodeId(kw.ok ? kw.data : null) ??
    null;

  const nodeIdPath =
    extractNodeIdPath(byAsin[primary]) ??
    (nodeId ? String(nodeId) : null);

  const marketRequest = {
    marketplace: parsed.marketplace,
    ...(nodeIdPath ? { nodeIdPath } : {}),
  };

  const [mr, mbc, msc, mldd, mpd] = await Promise.all([
    mcp.callToolSafe("market_research", { request: marketRequest }),
    mcp.callToolSafe("market_brand_concentration", { request: marketRequest }),
    mcp.callToolSafe("market_seller_concentration", { request: marketRequest }),
    mcp.callToolSafe("market_listing_date_distribution", { request: marketRequest }),
    mcp.callToolSafe("market_price_distribution", { request: marketRequest }),
  ]);

  const marketErrors: string[] = [];
  if (!mr.ok) marketErrors.push(`market_research: ${mr.error}`);
  if (!mbc.ok) marketErrors.push(`market_brand_concentration: ${mbc.error}`);
  if (!msc.ok) marketErrors.push(`market_seller_concentration: ${msc.error}`);
  if (!mldd.ok)
    marketErrors.push(`market_listing_date_distribution: ${mldd.error}`);
  if (!mpd.ok) marketErrors.push(`market_price_distribution: ${mpd.error}`);

  p("market", "市场竞争与价格带", 56);

  const [keepa, gTrend, pred] = await Promise.all([
    mcp.callToolSafe("keepa_info", {
      asin: primary,
      marketplace: parsed.marketplace,
    }),
    mcp.callToolSafe("google_trend", {
      asin: primary,
      marketplace: parsed.marketplace,
    }),
    mcp.callToolSafe("asin_prediction", {
      asin: primary,
      marketplace: parsed.marketplace,
    }),
  ]);

  const trendErrors: string[] = [];
  if (!keepa.ok) trendErrors.push(`keepa_info: ${keepa.error}`);
  if (!gTrend.ok) trendErrors.push(`google_trend: ${gTrend.error}`);
  if (!pred.ok) trendErrors.push(`asin_prediction: ${pred.error}`);

  const series = collectSeries(keepa.ok ? keepa.data : null);

  p("trends", "趋势与预测（Keepa / 谷歌趋势）", 64);

  const sellingPrice =
    guessPriceFromDetail(byAsin[primary]) ?? 29.99;
  const {
    purchaseCost,
    firstMile,
    fbaEstimate,
    referralPct,
    adPct,
    returnPct,
  } = profitInput;

  const referralFee = sellingPrice * referralPct;
  const adCost = sellingPrice * adPct;
  const returnCost = sellingPrice * returnPct;
  const netProfit =
    sellingPrice -
    purchaseCost -
    firstMile -
    fbaEstimate -
    referralFee -
    adCost -
    returnCost;
  const marginPct =
    sellingPrice > 0 ? (netProfit / sellingPrice) * 100 : 0;

  const scenarios = [
    { label: "当前价", sellingPrice, netProfit: 0, marginPct: 0 },
    {
      label: "降价 10%",
      sellingPrice: sellingPrice * 0.9,
      netProfit: 0,
      marginPct: 0,
    },
    {
      label: "提价 10%",
      sellingPrice: sellingPrice * 1.1,
      netProfit: 0,
      marginPct: 0,
    },
  ].map((row) => {
    const ref = row.sellingPrice * referralPct;
    const ad = row.sellingPrice * adPct;
    const ret = row.sellingPrice * returnPct;
    const net =
      row.sellingPrice -
      purchaseCost -
      firstMile -
      fbaEstimate -
      ref -
      ad -
      ret;
    const m = row.sellingPrice > 0 ? (net / row.sellingPrice) * 100 : 0;
    return { ...row, netProfit: net, marginPct: m };
  });

  const fixedOutOfPocket =
    purchaseCost + firstMile + fbaEstimate;
  const breakEvenHint =
    netProfit > 0 && marginPct > 0
      ? `粗略盈亏平衡：若仅考虑变动费率，需保证售价能覆盖 FBA+佣金+广告+退货假设；固定成本约 $${fixedOutOfPocket.toFixed(2)} / 件（采购+头程+FBA 估算）。`
      : "当前假设下净利润为负或接近零，需重新谈判采购价或提高售价。";

  p("profit", "利润测算", 72);

  const contextForAi = {
    marketplace: parsed.marketplace,
    asins: parsed.asins,
    basics: truncateJson(byAsin),
    traffic: truncateJson({
      keyword: kw.ok ? kw.data : null,
      source: src.ok ? src.data : null,
      listing: lst.ok ? lst.data : null,
    }),
    reviews: truncateJson(reviewByAsin),
    market: truncateJson({
      research: mr.ok ? mr.data : null,
      brand: mbc.ok ? mbc.data : null,
      seller: msc.ok ? msc.data : null,
    }),
    profit: {
      sellingPrice,
      marginPct,
      assumptions: profitInput,
    },
    trends: truncateJson({
      keepa: keepa.ok ? keepa.data : null,
      googleTrend: gTrend.ok ? gTrend.data : null,
    }),
  };

  p("claude_review", "Claude 评价洞察", 78);

  type PainJson = {
    painPoints?: Array<{ point: string; severity?: string; frequency?: string }>;
    differentiators?: string[];
    reviewSummary?: string;
    brandKeywords?: string[];
  };

  const painJson = await claudeJson<PainJson>({
    system:
      "你是亚马逊选品分析师。只输出合法 JSON，不要 markdown。字段：painPoints[{point,severity,frequency}], differentiators[string], reviewSummary(string), brandKeywords[string]。brandKeywords 是你从流量关键词列表中识别出的品牌词（如 Nike、Anker 等品牌名），如果没有品牌词则返回空数组。",
    user: `根据以下评价/MCP 数据摘要，提炼用户痛点 TOP5（可少于5）、差异化方向、简短评价总结。同时，从以下流量关键词中识别出品牌词。\n评价数据：${truncateJson(reviewByAsin, 6000)}\n流量关键词数据：${truncateJson(kw.ok ? kw.data : null, 2000)}`,
  });

  p("claude_score", "数据驱动评分 + Claude 微调", 86);

  // Extract top keywords from traffic data for brand ratio analysis
  const topKeywords: string[] = [];
  if (kw.ok && kw.data) {
    const kwData = kw.data as Record<string, unknown>;
    const extractKws = (obj: unknown, depth = 0): void => {
      if (depth > 5 || !obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) {
        for (const item of obj.slice(0, 20)) {
          if (typeof item === "string") topKeywords.push(item);
          else if (item && typeof item === "object") {
            const o = item as Record<string, unknown>;
            const kwStr = o.keyword ?? o.searchTerm ?? o.name ?? o.text;
            if (typeof kwStr === "string") topKeywords.push(kwStr);
          }
        }
        return;
      }
      for (const v of Object.values(obj as Record<string, unknown>)) {
        extractKws(v, depth + 1);
      }
    };
    extractKws(kwData);
  }

  const brandKeywords = painJson?.brandKeywords ?? [];

  // Data-driven scoring
  const { dimensions: dataDimensions, details: dimDetails } = calculateDataDrivenScore({
    trafficKeyword: kw.ok ? kw.data : null,
    marketResearch: mr.ok ? mr.data : null,
    asinDetails: byAsin,
    reviewByAsin,
    keepa: keepa.ok ? keepa.data : null,
    googleTrend: gTrend.ok ? gTrend.data : null,
    marginPct,
    brandKeywords,
    allKeywords: topKeywords,
  });

  const dataTotal = Object.values(dataDimensions).reduce((a, b) => a + b, 0);

  // Claude ±5 adjustment
  type AdjustJson = {
    adjustment?: number;
    rationale?: string;
  };

  const dimDetailStr = Object.entries(dimDetails)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const adjustJson = await claudeJson<AdjustJson>({
    system:
      "你是亚马逊选品决策助手。数据驱动评分系统已给出基础分，你需要根据数据摘要中可能遗漏的定性因素（如品牌壁垒、政策风险、季节性等）给出微调。只输出 JSON：{adjustment: -5到5之间的整数, rationale: string}。adjustment 正数表示数据低估了机会，负数表示数据高估了机会。",
    user: `数据驱动基础分: ${dataTotal}/100\n各维度详情:\n${dimDetailStr}\n\n数据摘要:\n${truncateJson(contextForAi, 8000)}`,
  });

  const adjustment = adjustJson && typeof adjustJson.adjustment === "number"
    ? Math.max(-5, Math.min(5, Math.round(adjustJson.adjustment)))
    : 0;
  const adjustRationale = adjustJson?.rationale ?? "";

  const finalTotal = Math.max(0, Math.min(100, dataTotal + adjustment));
  const band = bandFromTotal(finalTotal);
  const score: AnalysisResult["score"] = {
    total: finalTotal,
    band,
    label: bandLabel(band),
    dimensions: dataDimensions,
    rationale: `数据驱动基础分 ${dataTotal}${adjustment >= 0 ? "+" : ""}${adjustment} = ${finalTotal}。${adjustRationale}`,
  };

  p("claude_report", "生成完整报告", 93);

  const profitRequirement =
    "\n\n**利润分析章节要求：**必须严格使用数据摘要中 profit.assumptions 里用户提供的成本假设（purchaseCost=采购成本、firstMile=头程、fbaEstimate=FBA估算、referralPct=佣金比例、adPct=广告占比、returnPct=退货损耗占比）和 profit.sellingPrice（当前售价）来计算利润。使用表格展示：售价、采购成本、头程、FBA费、佣金、广告费、退货损耗、净利润、利润率。不要自行编造成本数据。同时展示降价10%和提价10%的利润敏感性分析。";

  const reportSystemHigh =
    "用中文撰写亚马逊选品分析报告，使用 Markdown。结构必须包含：## 竞品信息汇总（表格）、## 痛点分析、## 差异化创新建议、## 利润分析、## 工厂指示单（含产品描述、尺寸重量材质、必须改进点、包装、质量标准、目标成本、参考 ASIN、预计首批量）。语气专业简洁。" + profitRequirement;
  const reportSystemLow =
    "用中文撰写亚马逊选品分析报告，使用 Markdown。结构必须包含：## 竞品信息汇总（表格）、## 痛点分析、## 差异化创新建议、## 利润分析。不要写「工厂指示单」完整章节（读者将在页面底部按需单独生成）；语气专业简洁。" + profitRequirement;

  const profitSummary = `\n\n【用户利润假设 - 必须使用这些数据】\n售价: $${sellingPrice.toFixed(2)}\n采购成本: $${purchaseCost}\n头程: $${firstMile}\nFBA估算: $${fbaEstimate}\n佣金(${(referralPct * 100).toFixed(0)}%): $${referralFee.toFixed(2)}\n广告(${(adPct * 100).toFixed(0)}%): $${adCost.toFixed(2)}\n退货损耗(${(returnPct * 100).toFixed(0)}%): $${returnCost.toFixed(2)}\n净利润: $${netProfit.toFixed(2)}\n利润率: ${marginPct.toFixed(1)}%`;

  const reportMarkdown =
    (await claudeMessages({
      system: score.total >= 60 ? reportSystemHigh : reportSystemLow,
      user: `数据摘要：\n${truncateJson({ ...contextForAi, score }, 14000)}${profitSummary}`,
    })) ?? "# 报告生成失败\n请检查 Claude API Key 与模型额度。";

  let factorySpecMarkdown = "";
  if (score.total >= 60) {
    const auto = (
      await generateFactorySpecMarkdown({
        parsed,
        ai: {
          painPoints: painJson?.painPoints ?? [],
          reviewSummary: painJson?.reviewSummary ?? "",
          differentiators: painJson?.differentiators ?? [],
        },
      })
    ).trim();
    factorySpecMarkdown =
      auto ||
      "（自动生成失败，请点击报告底部「生成工厂指示单」重试。）";
  }

  const competitorTableMarkdown =
    `| ASIN | 说明 |\n| --- | --- |\n` +
    parsed.asins.map((a) => `| ${a} | 详见基础数据与 MCP 原始字段 |\n`).join("");

  const result: AnalysisResult = {
    parsed,
    basics: {
      byAsin,
      errors: detailErrors,
      lowPriceWarnings,
    },
    traffic: {
      keyword: kw.ok ? kw.data : null,
      source: src.ok ? src.data : null,
      listing: lst.ok ? lst.data : null,
      errors: trafficErrors,
    },
    reviews: { byAsin: reviewByAsin, errors: reviewErrors },
    market: {
      research: mr.ok ? mr.data : null,
      brandConc: mbc.ok ? mbc.data : null,
      sellerConc: msc.ok ? msc.data : null,
      listingDateDist: mldd.ok ? mldd.data : null,
      priceDist: mpd.ok ? mpd.data : null,
      errors: marketErrors,
    },
    profit: {
      assumptions: {
        sellingPrice,
        purchaseCost,
        firstMile,
        fbaEstimate,
        referralPct,
        adPct,
        returnPct,
      },
      breakdown: {
        referralFee,
        adCost,
        returnCost,
        netProfit,
        marginPct,
      },
      scenarios,
      breakEvenUnitsHint: breakEvenHint,
    },
    trends: {
      keepa: keepa.ok ? keepa.data : null,
      googleTrend: gTrend.ok ? gTrend.data : null,
      prediction: pred.ok ? pred.data : null,
      chartBsr: series.bsr,
      chartPrice: series.price,
      errors: trendErrors,
    },
    score,
    ai: {
      painPoints: painJson?.painPoints ?? [],
      reviewSummary: painJson?.reviewSummary ?? "",
      reportMarkdown,
      differentiators: painJson?.differentiators ?? [],
      factorySpecMarkdown,
      competitorTableMarkdown,
    },
  };

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90);

  await prisma.analysisCache.upsert({
    where: { cacheKey },
    create: {
      cacheKey,
      asin: parsed.asins[0] ?? "",
      marketplace: parsed.marketplace,
      analysisData: JSON.stringify(result),
      reportMarkdown: result.ai.reportMarkdown,
      score: score.total,
      analyzedById: userId,
      expiresAt,
    },
    update: {
      asin: parsed.asins[0] ?? "",
      marketplace: parsed.marketplace,
      analysisData: JSON.stringify(result),
      reportMarkdown: result.ai.reportMarkdown,
      score: score.total,
      analyzedById: userId,
      expiresAt,
    },
  });

  const report = await prisma.productAnalysisReport.create({
    data: {
      userId,
      marketplace: parsed.marketplace,
      asinsJson: JSON.stringify(parsed.asins),
      title: `选品分析 · ${parsed.asins.slice(0, 3).join(", ")}${parsed.asins.length > 3 ? "…" : ""}`,
      score: score.total,
      scoreBand: score.band,
      status: "completed",
      resultJson: JSON.stringify(result),
    },
  });

  await prisma.operationLog.create({
    data: {
      userId,
      action: "PRODUCT_ANALYSIS",
      resource: report.id,
      details: JSON.stringify({
        asins: parsed.asins,
        score: score.total,
        band: score.band,
      }),
    },
  });

  p("save", "已保存到历史记录", 100);

  return {
    result,
    reportId: report.id,
    fromCache: false,
  };
}
