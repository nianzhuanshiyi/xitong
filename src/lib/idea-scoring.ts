import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";

/**
 * Data-driven idea scoring using keyword_research MCP tool.
 * 5 dimensions × 20 points each = 100 total.
 */

export type IdeaScoreResult = {
  marketScore: number;       // 市场机会 (0-20)
  competitionScore: number;  // 竞争难度 (0-20)
  trendScore: number;        // 垄断程度 (0-20) — reuses DB field name
  profitScore: number;       // 推广成本 (0-20) — reuses DB field name
  reviewBarrierScore: number; // 评论壁垒 (0-20) — stored in aiJson
  totalScore: number;
  recommendation: string;    // strong_go / go / watch / pass
  competitionLevel: string;  // low / medium / high / extreme
  searchVolume: number | null;
  marketDataJson: string | null;
};

function deepNum(obj: unknown, key: string, depth = 0): number | null {
  if (depth > 8 || obj == null || typeof obj !== "object") return null;
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

function deepNumAll(obj: unknown, key: string, depth = 0): number[] {
  const results: number[] = [];
  if (depth > 8 || obj == null || typeof obj !== "object") return results;
  if (Array.isArray(obj)) {
    for (const x of obj) results.push(...deepNumAll(x, key, depth + 1));
    return results;
  }
  const o = obj as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    if (k.toLowerCase() === key.toLowerCase() && typeof v === "number") results.push(v);
  }
  for (const v of Object.values(o)) {
    results.push(...deepNumAll(v, key, depth + 1));
  }
  return results;
}

/** Extract items array from keyword_research response */
function extractFirstItem(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  if (Array.isArray(data)) return data[0] as Record<string, unknown> ?? null;
  const obj = data as Record<string, unknown>;
  const items = obj.items ?? obj.data;
  if (Array.isArray(items) && items.length > 0) return items[0] as Record<string, unknown>;
  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    const inner = obj.data as Record<string, unknown>;
    const innerItems = inner.items ?? inner.data;
    if (Array.isArray(innerItems) && innerItems.length > 0) return innerItems[0] as Record<string, unknown>;
  }
  return null;
}

const DEFAULT_SCORE: IdeaScoreResult = {
  marketScore: 10,
  competitionScore: 10,
  trendScore: 10,        // monopoly (reuses field name)
  profitScore: 10,        // ad cost / CPC (reuses field name)
  reviewBarrierScore: 10, // review barrier
  totalScore: 50,
  recommendation: "watch",
  competitionLevel: "medium",
  searchVolume: null,
  marketDataJson: null,
};

export async function scoreIdeaWithKeywordMiner(
  keyword: string,
  marketplace: string,
  logPrefix = "[idea-scoring]",
): Promise<IdeaScoreResult> {
  if (!keyword) return { ...DEFAULT_SCORE };

  try {
    const mcp = createSellerspriteMcpClient();
    const res = await mcp.callToolSafe("keyword_research", {
      request: {
        keywords: keyword,
        marketplace: marketplace.toUpperCase(),
        size: 3,
      },
    });

    if (!res.ok || !res.data) {
      console.warn(`${logPrefix} keyword_research failed:`, !res.ok ? res.error : "no data");
      return { ...DEFAULT_SCORE };
    }

    const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    const marketDataJson = JSON.stringify(data);

    // Extract first (most relevant) item from results
    const item = extractFirstItem(data);
    const source = item ?? data;

    const searches = deepNum(source, "searches")
      ?? deepNum(source, "monthlySearchVolume")
      ?? deepNum(source, "searchVolume")
      ?? deepNum(data, "searches");
    const products = deepNum(source, "products")
      ?? deepNum(source, "productCount")
      ?? deepNum(data, "products");
    const spr = deepNum(source, "spr") ?? deepNum(data, "spr");
    const monopolyClickRate = deepNum(source, "monopolyClickRate")
      ?? deepNum(source, "araClickRate")
      ?? deepNum(data, "monopolyClickRate");
    const avgRatings = deepNum(source, "avgRatings")
      ?? deepNum(source, "averageRatings")
      ?? deepNum(data, "avgRatings");

    // Extract CPC bid
    const bidValues = deepNumAll(source, "bid");
    const avgCpcBid = bidValues.length > 0
      ? bidValues.reduce((a, b) => a + b, 0) / bidValues.length
      : deepNum(source, "bid") ?? deepNum(data, "bid");

    // D1: Market Opportunity (20)
    let marketScore = 8;
    if (searches !== null) {
      if (searches >= 10000) marketScore = 20;
      else if (searches >= 5000) marketScore = 16;
      else if (searches >= 2000) marketScore = 12;
      else if (searches >= 500) marketScore = 8;
      else marketScore = 4;
    }

    // D2: Competition Difficulty (20)
    let competitionScore = 10;
    if (products !== null || spr !== null) {
      const p = products ?? 999;
      const s = spr ?? 15;
      if (p < 200 && s < 5) competitionScore = 20;
      else if (p < 500 && s < 10) competitionScore = 16;
      else if (p < 1000 && s < 20) competitionScore = 12;
      else if (p < 3000) competitionScore = 8;
      else competitionScore = 4;
    }

    // D3: Monopoly Degree (20) — stored in trendScore field
    let monopolyScore = 10;
    if (monopolyClickRate !== null) {
      const rate = monopolyClickRate > 1 ? monopolyClickRate / 100 : monopolyClickRate;
      if (rate < 0.3) monopolyScore = 20;
      else if (rate < 0.5) monopolyScore = 16;
      else if (rate < 0.6) monopolyScore = 12;
      else if (rate < 0.75) monopolyScore = 8;
      else monopolyScore = 4;
    }

    // D4: Ad Cost / CPC (20) — stored in profitScore field
    let adCostScore = 10;
    if (avgCpcBid !== null) {
      if (avgCpcBid <= 0.80) adCostScore = 20;
      else if (avgCpcBid <= 1.30) adCostScore = 15;
      else if (avgCpcBid <= 2.00) adCostScore = 10;
      else if (avgCpcBid <= 3.00) adCostScore = 5;
      else adCostScore = 2;
    }

    // D5: Review Barrier (20) — new dimension
    let reviewBarrierScore = 10;
    if (avgRatings !== null) {
      if (avgRatings < 200) reviewBarrierScore = 20;
      else if (avgRatings < 1000) reviewBarrierScore = 15;
      else if (avgRatings < 5000) reviewBarrierScore = 10;
      else if (avgRatings < 15000) reviewBarrierScore = 5;
      else reviewBarrierScore = 2;
    }

    const totalScore = marketScore + competitionScore + monopolyScore + adCostScore + reviewBarrierScore;

    let recommendation = "watch";
    if (totalScore >= 70) recommendation = "strong_go";
    else if (totalScore >= 50) recommendation = "go";
    else if (totalScore >= 30) recommendation = "watch";
    else recommendation = "pass";

    let competitionLevel = "medium";
    if (competitionScore >= 16) competitionLevel = "low";
    else if (competitionScore >= 12) competitionLevel = "medium";
    else if (competitionScore >= 8) competitionLevel = "high";
    else competitionLevel = "extreme";

    return {
      marketScore,
      competitionScore,
      trendScore: monopolyScore,
      profitScore: adCostScore,
      reviewBarrierScore,
      totalScore,
      recommendation,
      competitionLevel,
      searchVolume: searches,
      marketDataJson,
    };
  } catch (e) {
    console.warn(`${logPrefix} keyword_research error:`, e instanceof Error ? e.message : e);
    return { ...DEFAULT_SCORE };
  }
}

/** Build markdown analysis report for an idea with data-driven scores */
export function buildIdeaAnalysis(
  name: string,
  description: string,
  scores: IdeaScoreResult,
): string {
  if (!scores.searchVolume && scores.totalScore === 50) {
    return `## ${name}\n\n暂无详细分析报告，市场数据待获取。`;
  }
  const bandLabel =
    scores.totalScore >= 70 ? "蓝海机会，强烈推荐" :
    scores.totalScore >= 50 ? "有潜力，值得深入" :
    scores.totalScore >= 30 ? "竞争较大，需差异化" :
    "红海，不推荐";
  return [
    `## ${name} - 数据验证报告`,
    "",
    `### 产品概述`,
    description,
    "",
    `### 市场数据`,
    `- 月搜索量：${scores.searchVolume?.toLocaleString() ?? "未知"}`,
    `- 竞争程度：${scores.competitionLevel}`,
    "",
    `### 数据驱动评分（5维度×20分）`,
    `- 市场机会：${scores.marketScore}/20`,
    `- 竞争难度：${scores.competitionScore}/20`,
    `- 垄断程度：${scores.trendScore}/20`,
    `- 推广成本：${scores.profitScore}/20`,
    `- 评论壁垒：${scores.reviewBarrierScore ?? "N/A"}/20`,
    `- **总分：${scores.totalScore}/100**`,
    "",
    `### 推荐意见`,
    `**${bandLabel}**`,
  ].join("\n");
}
