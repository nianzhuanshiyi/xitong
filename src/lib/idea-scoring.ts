import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";

/**
 * Data-driven idea scoring using keyword_miner MCP tool.
 * 4 dimensions × 25 points each = 100 total.
 */

export type IdeaScoreResult = {
  marketScore: number;       // 市场机会 (0-25)
  competitionScore: number;  // 竞争难度 (0-25)
  trendScore: number;        // 垄断程度 (0-25) — reuses DB field name
  profitScore: number;       // 推广成本 (0-25) — reuses DB field name
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

const DEFAULT_SCORE: IdeaScoreResult = {
  marketScore: 13,
  competitionScore: 13,
  trendScore: 13,        // monopoly (reuses field name)
  profitScore: 13,        // ad cost / CPC (reuses field name)
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
    const res = await mcp.callToolSafe("keyword_miner", {
      request: {
        keyword,
        marketplace: marketplace.toUpperCase(),
        size: 1,
      },
    });

    if (!res.ok || !res.data) {
      console.warn(`${logPrefix} keyword_miner failed:`, !res.ok ? res.error : "no data");
      return { ...DEFAULT_SCORE };
    }

    const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    const marketDataJson = JSON.stringify(data);

    const searches = deepNum(data, "searches")
      ?? deepNum(data, "monthlySearchVolume")
      ?? deepNum(data, "searchVolume");
    const products = deepNum(data, "products")
      ?? deepNum(data, "productCount");
    const spr = deepNum(data, "spr");
    const monopolyClickRate = deepNum(data, "monopolyClickRate");

    // Extract CPC bid from keyword_miner items
    const bidValues = deepNumAll(data, "bid");
    const avgCpcBid = bidValues.length > 0
      ? bidValues.reduce((a, b) => a + b, 0) / bidValues.length
      : null;

    // D1: Market Opportunity (25)
    let marketScore = 10;
    if (searches !== null) {
      if (searches >= 10000) marketScore = 25;
      else if (searches >= 5000) marketScore = 20;
      else if (searches >= 2000) marketScore = 15;
      else if (searches >= 500) marketScore = 10;
      else marketScore = 5;
    }

    // D2: Competition Difficulty (25)
    let competitionScore = 13;
    if (products !== null || spr !== null) {
      const p = products ?? 999;
      const s = spr ?? 15;
      if (p < 200 && s < 5) competitionScore = 25;
      else if (p < 500 && s < 10) competitionScore = 20;
      else if (p < 1000 && s < 20) competitionScore = 15;
      else if (p < 3000) competitionScore = 10;
      else competitionScore = 5;
    }

    // D3: Monopoly Degree (25) — stored in trendScore field
    let monopolyScore = 13;
    if (monopolyClickRate !== null) {
      if (monopolyClickRate < 0.3) monopolyScore = 25;
      else if (monopolyClickRate < 0.5) monopolyScore = 20;
      else if (monopolyClickRate < 0.6) monopolyScore = 15;
      else if (monopolyClickRate < 0.75) monopolyScore = 10;
      else monopolyScore = 5;
    }

    // D4: Ad Cost / CPC (25) — stored in profitScore field
    let adCostScore = 13;
    if (avgCpcBid !== null) {
      if (avgCpcBid <= 0.50) adCostScore = 25;
      else if (avgCpcBid <= 0.80) adCostScore = 20;
      else if (avgCpcBid <= 1.20) adCostScore = 15;
      else if (avgCpcBid <= 2.00) adCostScore = 10;
      else adCostScore = 5;
    }

    const totalScore = marketScore + competitionScore + monopolyScore + adCostScore;

    let recommendation = "watch";
    if (totalScore >= 75) recommendation = "strong_go";
    else if (totalScore >= 55) recommendation = "go";
    else if (totalScore < 35) recommendation = "pass";

    let competitionLevel = "medium";
    if (competitionScore >= 20) competitionLevel = "low";
    else if (competitionScore >= 15) competitionLevel = "medium";
    else if (competitionScore >= 10) competitionLevel = "high";
    else competitionLevel = "extreme";

    return {
      marketScore,
      competitionScore,
      trendScore: monopolyScore,
      profitScore: adCostScore,
      totalScore,
      recommendation,
      competitionLevel,
      searchVolume: searches,
      marketDataJson,
    };
  } catch (e) {
    console.warn(`${logPrefix} keyword_miner error:`, e instanceof Error ? e.message : e);
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
    scores.totalScore >= 75 ? "蓝海机会，强烈推荐" :
    scores.totalScore >= 55 ? "有潜力，值得深入" :
    scores.totalScore >= 35 ? "竞争较大，需差异化" :
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
    `### 数据驱动评分（4维度×25分）`,
    `- 市场机会：${scores.marketScore}/25`,
    `- 竞争难度：${scores.competitionScore}/25`,
    `- 垄断程度：${scores.trendScore}/25`,
    `- 推广成本：${scores.profitScore}/25`,
    `- **总分：${scores.totalScore}/100**`,
    "",
    `### 推荐意见`,
    `**${bandLabel}**`,
  ].join("\n");
}
