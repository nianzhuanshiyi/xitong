import { prisma } from "@/lib/prisma";
import {
  fetchWalmartProductById,
  fetchWalmartReviews,
  fetchWalmartSearchResult,
} from "./searchapi-client";
import { parseWalmartProductUrl } from "./url-parser";
import type {
  GeneratedKeyword,
  KeywordRanking,
  ReviewRecord,
  SalesModelConfig,
  SalesEstimate,
  TrendMetrics,
  WalmartCompetitiveAnalysisResult,
  WalmartProductSnapshot,
} from "./types";

function stableStringify(input: unknown): string {
  if (input == null || typeof input !== "object") return JSON.stringify(input);
  if (Array.isArray(input)) return `[${input.map((x) => stableStringify(x)).join(",")}]`;
  const obj = input as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

function buildWalmartCacheKey(args: {
  userId: string;
  productId: string;
  competitorUrl: string;
  modelConfig: SalesModelConfig;
}): string {
  return stableStringify({
    userId: args.userId,
    productId: args.productId,
    competitorUrl: args.competitorUrl,
    modelConfig: args.modelConfig,
    version: 1,
  });
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function readFirstString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** SearchAPI `walmart_product` 根级含 `product`；部分字段在 `reviews` 下 */
function getProductBlock(raw: Record<string, unknown>): Record<string, unknown> {
  const p = raw.product;
  if (p && typeof p === "object" && !Array.isArray(p)) return p as Record<string, unknown>;
  return raw;
}

function getReviewsBlock(raw: Record<string, unknown>): Record<string, unknown> | null {
  const r = raw.reviews;
  if (r && typeof r === "object" && !Array.isArray(r)) return r as Record<string, unknown>;
  return null;
}

function readCategoryFromProduct(product: Record<string, unknown>): string {
  const cats = product.categories;
  if (Array.isArray(cats) && cats.length > 0) {
    const first = cats[0];
    if (first && typeof first === "object" && "name" in first && typeof (first as { name?: unknown }).name === "string") {
      return String((first as { name: string }).name).trim();
    }
  }
  return readFirstString(product, ["category", "department"]);
}

function readBrandFromProduct(product: Record<string, unknown>): string {
  const b = product.brand;
  if (b && typeof b === "object" && !Array.isArray(b) && "name" in b) {
    const n = (b as { name?: unknown }).name;
    if (typeof n === "string" && n.trim()) return n.trim();
  }
  return readFirstString(product, ["brand", "brand_name"]);
}

function readPriceFromProduct(product: Record<string, unknown>): number | null {
  const direct =
    toNumber(product.extracted_price) ??
    toNumber(product.current_price) ??
    toNumber(product.offer_price);
  if (direct != null) return direct;
  const offers = product.condition_offers;
  if (Array.isArray(offers) && offers[0] && typeof offers[0] === "object") {
    const o = offers[0] as Record<string, unknown>;
    const fromOffer = toNumber(o.extracted_price) ?? toNumber(o.price);
    if (fromOffer != null) return fromOffer;
  }
  const priceStr = product.price;
  if (typeof priceStr === "string") {
    const n = toNumber(priceStr);
    if (n != null) return n;
  }
  const priceObj = (product.price ?? product.pricing) as Record<string, unknown> | undefined;
  return toNumber(priceObj?.current) ?? toNumber(priceObj?.price) ?? null;
}

function normalizeProductSnapshot(productId: string, raw: Record<string, unknown>): WalmartProductSnapshot {
  const product = getProductBlock(raw);
  const reviewsRoot = getReviewsBlock(raw);

  const name =
    readFirstString(product, ["title", "name", "product_name"]) ||
    readFirstString(raw, ["title", "name", "product_name"]);
  const brand = readBrandFromProduct(product) || readFirstString(raw, ["brand", "brand_name"]);
  const category = readCategoryFromProduct(product) || readFirstString(raw, ["category", "department"]);
  const sellerName =
    readFirstString(product, ["seller_name", "seller"]) || readFirstString(raw, ["seller_name", "seller"]);

  const price = readPriceFromProduct(product);

  const rating =
    toNumber(product.rating) ??
    (reviewsRoot ? toNumber(reviewsRoot.rating) : null) ??
    toNumber(raw.rating) ??
    null;

  const reviewCount =
    toNumber(product.reviews) ??
    toNumber(product.number_of_reviews) ??
    toNumber(product.review_count) ??
    (reviewsRoot
      ? toNumber(reviewsRoot.total_review_count) ?? toNumber(reviewsRoot.total_reviews) ?? toNumber(reviewsRoot.count)
      : null) ??
    toNumber(raw.review_count) ??
    toNumber(raw.reviews_count) ??
    null;

  return {
    productId,
    name,
    brand,
    category,
    price,
    rating,
    reviewCount,
    sellerName,
    raw,
  };
}

function defaultModelConfigByCategory(category: string): SalesModelConfig {
  const c = category.toLowerCase();
  if (c.includes("beauty") || c.includes("personal care")) {
    return {
      reviewWeight: 0.1,
      recent30dWeight: 9,
      lowRangeFactor: 0.75,
      highRangeFactor: 1.35,
      rankMultiplierHigh: 1.45,
      rankMultiplierMedium: 1.2,
      rankMultiplierLow: 0.85,
    };
  }
  if (c.includes("electronics") || c.includes("tech")) {
    return {
      reviewWeight: 0.14,
      recent30dWeight: 7,
      lowRangeFactor: 0.82,
      highRangeFactor: 1.25,
      rankMultiplierHigh: 1.35,
      rankMultiplierMedium: 1.12,
      rankMultiplierLow: 0.8,
    };
  }
  return {
    reviewWeight: 0.12,
    recent30dWeight: 8,
    lowRangeFactor: 0.8,
    highRangeFactor: 1.3,
    rankMultiplierHigh: 1.4,
    rankMultiplierMedium: 1.15,
    rankMultiplierLow: 0.85,
  };
}

function normalizeModelConfig(base: SalesModelConfig, input?: Partial<SalesModelConfig>): SalesModelConfig {
  return {
    reviewWeight: Math.max(0.02, Math.min(0.5, Number(input?.reviewWeight ?? base.reviewWeight))),
    recent30dWeight: Math.max(1, Math.min(30, Number(input?.recent30dWeight ?? base.recent30dWeight))),
    lowRangeFactor: Math.max(0.4, Math.min(1.2, Number(input?.lowRangeFactor ?? base.lowRangeFactor))),
    highRangeFactor: Math.max(1, Math.min(2.2, Number(input?.highRangeFactor ?? base.highRangeFactor))),
    rankMultiplierHigh: Math.max(0.7, Math.min(2.5, Number(input?.rankMultiplierHigh ?? base.rankMultiplierHigh))),
    rankMultiplierMedium: Math.max(0.7, Math.min(2.5, Number(input?.rankMultiplierMedium ?? base.rankMultiplierMedium))),
    rankMultiplierLow: Math.max(0.5, Math.min(2, Number(input?.rankMultiplierLow ?? base.rankMultiplierLow))),
  };
}

function generateKeywords(snapshot: WalmartProductSnapshot): GeneratedKeyword[] {
  const set = new Map<string, GeneratedKeyword["source"]>();
  const titleWords = snapshot.name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((x) => x.length >= 3 && !["with", "for", "and", "the"].includes(x))
    .slice(0, 6);

  const titleNGrams: string[] = [];
  for (let i = 0; i < titleWords.length - 1; i += 1) {
    titleNGrams.push(`${titleWords[i]} ${titleWords[i + 1]}`);
  }

  titleNGrams.slice(0, 5).forEach((kw) => set.set(kw, "title"));
  if (snapshot.category) set.set(snapshot.category.toLowerCase(), "category");
  if (snapshot.brand) set.set(`${snapshot.brand.toLowerCase()} ${titleWords[0] ?? ""}`.trim(), "attribute");

  return Array.from(set.entries())
    .map(([keyword, source]) => ({ keyword, source }))
    .filter((x) => x.keyword.length >= 3)
    .slice(0, 8);
}

function extractOrganicResults(raw: Record<string, unknown>): Array<Record<string, unknown>> {
  const organic = raw.organic_results;
  if (Array.isArray(organic)) {
    return organic.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"));
  }
  return [];
}

async function collectKeywordRankings(productId: string, keywords: GeneratedKeyword[]): Promise<KeywordRanking[]> {
  const rows: KeywordRanking[] = [];
  for (const keyword of keywords) {
    const searchRaw = await fetchWalmartSearchResult(keyword.keyword, 1);
    const organicResults = extractOrganicResults(searchRaw);

    let rank: number | null = null;
    let matchedTitle = "";
    let matchedProductId = "";
    for (let i = 0; i < organicResults.length; i += 1) {
      const row = organicResults[i]!;
      const pid = String(row.product_id ?? row.id ?? "");
      if (pid && pid === productId) {
        rank = i + 1;
        matchedTitle = typeof row.title === "string" ? row.title : "";
        matchedProductId = pid;
        break;
      }
    }

    rows.push({
      keyword: keyword.keyword,
      rank,
      totalResults: organicResults.length > 0 ? organicResults.length : null,
      matchedTitle,
      matchedProductId,
      raw: searchRaw,
    });
  }
  return rows;
}

function extractReviewRows(raw: Record<string, unknown>): unknown[] {
  const nested = raw.reviews;
  if (Array.isArray(nested)) return nested;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const ro = nested as Record<string, unknown>;
    if (Array.isArray(ro.customer_reviews)) return ro.customer_reviews;
    if (Array.isArray(ro.items)) return ro.items;
  }
  if (Array.isArray(raw.customer_reviews)) return raw.customer_reviews;
  if (Array.isArray(raw.review_results)) return raw.review_results;
  return [];
}

function parseReviewDate(row: Record<string, unknown>): string {
  const iso = row.extracted_date;
  if (typeof iso === "string" && iso.trim()) return iso.trim();
  const d = row.date;
  if (typeof d === "string" && d.trim()) return d.trim();
  return "";
}

function normalizeReviews(raw: Record<string, unknown>): ReviewRecord[] {
  const list = extractReviewRows(raw);
  return list
    .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"))
    .map((row) => ({
      reviewId: String(row.id ?? row.review_id ?? ""),
      title: typeof row.title === "string" ? row.title : "",
      text:
        typeof row.text === "string"
          ? row.text
          : typeof row.body === "string"
            ? row.body
            : "",
      rating: toNumber(row.rating),
      reviewer:
        typeof row.user_name === "string"
          ? row.user_name
          : typeof row.reviewer === "string"
            ? row.reviewer
            : "",
      reviewDate: parseReviewDate(row),
      raw: row,
    }))
    .filter((x) => x.reviewId || x.text);
}

function extractTotalReviewHint(raw: Record<string, unknown>): number | null {
  const direct = toNumber(raw.total_review_count) ?? toNumber(raw.total_reviews) ?? toNumber(raw.review_count);
  if (direct != null) return direct;
  const nested = raw.reviews;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const ro = nested as Record<string, unknown>;
    return toNumber(ro.total_review_count) ?? toNumber(ro.total_reviews);
  }
  return null;
}

async function collectReviews(productId: string): Promise<{ reviews: ReviewRecord[]; totalReviewHint: number | null }> {
  const pages = [1, 2, 3];
  let totalReviewHint: number | null = null;
  const all: ReviewRecord[] = [];
  for (const page of pages) {
    const raw = (await fetchWalmartReviews(productId, page)) as Record<string, unknown>;
    if (page === 1) {
      totalReviewHint = extractTotalReviewHint(raw);
    }
    all.push(...normalizeReviews(raw));
  }
  const dedup = new Map<string, ReviewRecord>();
  for (const row of all) {
    const key = row.reviewId || `${row.reviewer}-${row.reviewDate}-${row.title}`;
    if (!dedup.has(key)) dedup.set(key, row);
  }
  return { reviews: Array.from(dedup.values()).slice(0, 300), totalReviewHint };
}

function reviewTimestampMs(review: ReviewRecord): number | null {
  const primary = Date.parse(review.reviewDate);
  if (Number.isFinite(primary)) return primary;
  if (review.raw && typeof review.raw === "object") {
    const r = review.raw as Record<string, unknown>;
    const iso = typeof r.extracted_date === "string" ? Date.parse(r.extracted_date) : NaN;
    if (Number.isFinite(iso)) return iso;
  }
  return null;
}

function computeTrend(reviews: ReviewRecord[]): TrendMetrics {
  const now = Date.now();
  const d30 = 30 * 24 * 60 * 60 * 1000;
  const d90 = 90 * 24 * 60 * 60 * 1000;
  let recent30dReviewCount = 0;
  let recent90dReviewCount = 0;
  const monthlyMap = new Map<string, number>();

  for (const review of reviews) {
    const ts = reviewTimestampMs(review);
    if (ts == null) continue;
    const age = now - ts;
    if (age <= d30) recent30dReviewCount += 1;
    if (age <= d90) recent90dReviewCount += 1;
    const key = new Date(ts).toISOString().slice(0, 7);
    monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + 1);
  }

  const monthlyReviewSeries = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-6)
    .map(([month, count]) => ({ month, count }));

  let trendDirection: "up" | "flat" | "down" = "flat";
  if (monthlyReviewSeries.length >= 2) {
    const last = monthlyReviewSeries[monthlyReviewSeries.length - 1]!.count;
    const prev = monthlyReviewSeries[monthlyReviewSeries.length - 2]!.count;
    if (last >= prev * 1.2) trendDirection = "up";
    else if (last <= prev * 0.8) trendDirection = "down";
  }

  return {
    recent30dReviewCount,
    recent90dReviewCount,
    monthlyReviewSeries,
    trendDirection,
  };
}

function estimateSales(
  snapshot: WalmartProductSnapshot,
  rankings: KeywordRanking[],
  trend: TrendMetrics,
  modelConfig: SalesModelConfig
): SalesEstimate {
  const price = snapshot.price;
  const hasValidPrice = price != null && price > 0;
  const reviewCount = snapshot.reviewCount ?? 0;
  const rankedKeywords = rankings.filter((x) => x.rank != null && x.rank <= 20).length;
  const baseByReviews = Math.max(5, Math.round(reviewCount * modelConfig.reviewWeight));
  const baseByRecent = Math.max(5, Math.round(trend.recent30dReviewCount * modelConfig.recent30dWeight));
  const rankMultiplier =
    rankedKeywords >= 3
      ? modelConfig.rankMultiplierHigh
      : rankedKeywords >= 1
        ? modelConfig.rankMultiplierMedium
        : modelConfig.rankMultiplierLow;
  const low = Math.max(1, Math.round(Math.min(baseByReviews, baseByRecent) * modelConfig.lowRangeFactor * rankMultiplier));
  const high = Math.max(low + 1, Math.round(Math.max(baseByReviews, baseByRecent) * modelConfig.highRangeFactor * rankMultiplier));
  const confidence: "low" | "medium" | "high" =
    reviewCount >= 500 && rankings.length >= 5
      ? "high"
      : reviewCount >= 100
        ? "medium"
        : "low";

  const rationale = [
    `评论总量 ${reviewCount}，近30天评论 ${trend.recent30dReviewCount}`,
    `关键词前20排名命中 ${rankedKeywords} 个`,
    `趋势方向 ${trend.trendDirection === "up" ? "上升" : trend.trendDirection === "down" ? "下降" : "平稳"}`,
    `模型系数 reviewWeight=${modelConfig.reviewWeight} recent30dWeight=${modelConfig.recent30dWeight}`,
  ];

  const risks: string[] = [];
  if (rankedKeywords === 0) risks.push("核心关键词未进入前20，销量估算偏乐观风险高");
  if (trend.trendDirection === "down") risks.push("近期评论趋势下降，存在需求回落风险");
  if ((snapshot.rating ?? 0) < 4) risks.push("评分偏低，转化率可能低于同类目均值");

  return {
    monthlySalesLow: low,
    monthlySalesHigh: high,
    monthlyRevenueLow: hasValidPrice ? Math.round(low * price) : null,
    monthlyRevenueHigh: hasValidPrice ? Math.round(high * price) : null,
    confidence,
    rationale,
    risks,
    modelDetail: {
      reviewCount,
      recent30dReviewCount: trend.recent30dReviewCount,
      rankedKeywordsTop20: rankedKeywords,
      reviewDrivenBase: baseByReviews,
      recentDrivenBase: baseByRecent,
      rankMultiplier,
    },
  };
}

export async function runWalmartCompetitiveAnalysis(params: {
  competitorUrl: string;
  userId: string;
  modelConfig?: Partial<SalesModelConfig>;
  forceRefresh?: boolean;
}): Promise<{
  analysisId: string;
  result: WalmartCompetitiveAnalysisResult;
  fromCache: boolean;
}> {
  const parsed = parseWalmartProductUrl(params.competitorUrl);
  const productRaw = await fetchWalmartProductById(parsed.productId);
  const product = normalizeProductSnapshot(parsed.productId, productRaw);
  const modelConfig = normalizeModelConfig(defaultModelConfigByCategory(product.category), params.modelConfig);
  const cacheKey = buildWalmartCacheKey({
    userId: params.userId,
    productId: parsed.productId,
    competitorUrl: parsed.url,
    modelConfig,
  });

  if (!params.forceRefresh) {
    const hit = await prisma.walmartCompetitorAnalysis.findFirst({
      where: {
        userId: params.userId,
        cacheKey,
        status: "completed",
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        expiresAt: true,
        reportJson: true,
      },
    });
    if (hit?.reportJson && hit.expiresAt && hit.expiresAt.getTime() > Date.now()) {
      const parsedReport = JSON.parse(hit.reportJson) as {
        estimate: WalmartCompetitiveAnalysisResult["estimate"];
        trend: WalmartCompetitiveAnalysisResult["trend"];
        modelConfig: WalmartCompetitiveAnalysisResult["modelConfig"];
      };
      const result: WalmartCompetitiveAnalysisResult = {
        product,
        keywords: generateKeywords(product),
        rankings: [],
        reviews: [],
        trend: parsedReport.trend,
        estimate: parsedReport.estimate,
        modelConfig: parsedReport.modelConfig ?? modelConfig,
      };
      return {
        analysisId: hit.id,
        result,
        fromCache: true,
      };
    }
  }

  const keywords = generateKeywords(product);
  const rankings = await collectKeywordRankings(parsed.productId, keywords);
  const { reviews: reviewRecords, totalReviewHint } = await collectReviews(parsed.productId);
  const trend = computeTrend(reviewRecords);

  const mergedReviewCount = Math.max(
    product.reviewCount ?? 0,
    totalReviewHint ?? 0,
    reviewRecords.length > 0 &&
      (product.reviewCount == null || product.reviewCount === 0) &&
      (totalReviewHint == null || totalReviewHint === 0)
      ? reviewRecords.length
      : 0
  );
  const productResolved: WalmartProductSnapshot =
    mergedReviewCount > 0
      ? { ...product, reviewCount: mergedReviewCount }
      : product;

  const estimate = estimateSales(productResolved, rankings, trend, modelConfig);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const analysis = await prisma.walmartCompetitorAnalysis.upsert({
    where: { cacheKey },
    create: {
      userId: params.userId,
      cacheKey,
      expiresAt,
      competitorUrl: parsed.url,
      productId: parsed.productId,
      status: "completed",
      productName: productResolved.name,
      reportJson: JSON.stringify({
        estimate,
        trend,
        modelConfig,
      }),
    },
    update: {
      expiresAt,
      competitorUrl: parsed.url,
      productId: parsed.productId,
      status: "completed",
      errorMessage: null,
      productName: productResolved.name,
      reportJson: JSON.stringify({
        estimate,
        trend,
        modelConfig,
      }),
      updatedAt: new Date(),
    },
  });

  await prisma.walmartProductSnapshot.deleteMany({ where: { analysisId: analysis.id } });
  await prisma.walmartKeywordRanking.deleteMany({ where: { analysisId: analysis.id } });
  await prisma.walmartReviewRecord.deleteMany({ where: { analysisId: analysis.id } });

  await prisma.walmartProductSnapshot.create({
    data: {
      analysisId: analysis.id,
      productId: productResolved.productId,
      name: productResolved.name,
      brand: productResolved.brand,
      category: productResolved.category,
      price: productResolved.price,
      rating: productResolved.rating,
      reviewCount: productResolved.reviewCount,
      sellerName: productResolved.sellerName,
      rawJson: JSON.stringify(productResolved.raw ?? {}),
    },
  });

  if (rankings.length > 0) {
    await prisma.walmartKeywordRanking.createMany({
      data: rankings.map((row) => ({
        analysisId: analysis.id,
        keyword: row.keyword,
        rank: row.rank,
        totalResults: row.totalResults,
        matchedTitle: row.matchedTitle,
        matchedProductId: row.matchedProductId,
        rawJson: JSON.stringify(row.raw ?? {}),
      })),
    });
  }

  if (reviewRecords.length > 0) {
    await prisma.walmartReviewRecord.createMany({
      data: reviewRecords.map((row) => ({
        analysisId: analysis.id,
        reviewId: row.reviewId || null,
        title: row.title,
        text: row.text,
        rating: row.rating,
        reviewer: row.reviewer,
        reviewDate: row.reviewDate || null,
        rawJson: JSON.stringify(row.raw ?? {}),
      })),
    });
  }

  await prisma.operationLog.create({
    data: {
      userId: params.userId,
      action: "WALMART_COMPETITOR_ANALYSIS",
      resource: analysis.id,
      details: JSON.stringify({
        productId: parsed.productId,
        keywordCount: keywords.length,
        reviewCount: reviewRecords.length,
      }),
    },
  });

  return {
    analysisId: analysis.id,
    result: {
      product: productResolved,
      keywords,
      rankings,
      reviews: reviewRecords,
      trend,
      estimate,
      modelConfig,
    },
    fromCache: false,
  };
}
