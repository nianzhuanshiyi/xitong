import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { claudeJson } from "@/lib/claude-client";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SYSTEM_PROMPT = `你是一位资深美妆产品经理，服务于亚马逊跨境美妆卖家。
我们在美国、中国、韩国都有供应链，产品主要在亚马逊和TikTok Shop线上销售。

根据提供的趋势信息，为每条趋势生成1-2个具体的新品创意。

每个创意需要包含：
{
  "trendId": "关联的趋势ID",
  "name": "产品名称（中英文，如：微针玻尿酸精华面膜 Microneedle HA Serum Mask）",
  "category": "skincare/makeup/haircare/bodycare/fragrance",
  "description": "产品描述（150-300字，说明产品是什么、怎么用、解决什么问题）",
  "targetMarket": "US",
  "keyIngredients": ["核心成分1", "成分2", "成分3"],
  "sellingPoints": ["卖点1", "卖点2", "卖点3", "卖点4"],
  "estimatedPrice": "$15-25",
  "estimatedCost": "$3-6",
  "searchKeywords": ["amazon搜索关键词1", "关键词2", "关键词3"]
}

要求：
- 产品要适合亚马逊线上销售（方便运输、不易损坏）
- 关注FDA合规性，不使用未批准的成分
- 差异化：产品要有明确的差异点，不是简单的Me-too
- 定价要合理，有足够的利润空间
- 成分搭配要科学合理

请返回JSON数组。`;

type IdeaItem = {
  trendId: string;
  name: string;
  category: string;
  description: string;
  targetMarket: string;
  keyIngredients: string[];
  sellingPoints: string[];
  estimatedPrice: string;
  estimatedCost: string;
  searchKeywords: string[];
};

function calcScores(idea: {
  trendScore: number;
  searchVolume: number | null;
  avgReviews?: number;
  newProductRatio?: number;
  estimatedPrice: string;
  estimatedCost: string;
}) {
  // 趋势分 (0-25)
  const trendScore = Math.round((idea.trendScore / 100) * 25);

  // 市场分 (0-25): 搜索量越大越好
  let marketScore = 5;
  if (idea.searchVolume) {
    if (idea.searchVolume >= 50000) marketScore = 25;
    else if (idea.searchVolume >= 20000) marketScore = 20;
    else if (idea.searchVolume >= 10000) marketScore = 16;
    else if (idea.searchVolume >= 5000) marketScore = 12;
    else if (idea.searchVolume >= 2000) marketScore = 8;
  }

  // 竞争分 (0-25): 竞争越小分越高
  let competitionScore = 13;
  const avgReviews = idea.avgReviews ?? 500;
  if (avgReviews < 100) competitionScore = 25;
  else if (avgReviews < 300) competitionScore = 20;
  else if (avgReviews < 500) competitionScore = 16;
  else if (avgReviews < 1000) competitionScore = 12;
  else if (avgReviews < 3000) competitionScore = 8;
  else if (avgReviews < 5000) competitionScore = 4;
  else competitionScore = 2;
  // 新品占比高加分
  if (idea.newProductRatio && idea.newProductRatio > 0.3) {
    competitionScore = Math.min(25, competitionScore + 3);
  }

  // 利润分 (0-25)
  let profitScore = 10;
  const priceMatch = idea.estimatedPrice.match(/\$?(\d+)/);
  const costMatch = idea.estimatedCost.match(/\$?(\d+)/);
  if (priceMatch && costMatch) {
    const price = parseFloat(priceMatch[1]);
    const cost = parseFloat(costMatch[1]);
    const margin = (price - cost) / price;
    if (margin >= 0.7) profitScore = 25;
    else if (margin >= 0.6) profitScore = 20;
    else if (margin >= 0.5) profitScore = 16;
    else if (margin >= 0.4) profitScore = 12;
    else if (margin >= 0.3) profitScore = 8;
    else profitScore = 4;
  }

  const totalScore = trendScore + marketScore + competitionScore + profitScore;

  let recommendation = "watch";
  if (totalScore >= 75) recommendation = "strong_go";
  else if (totalScore >= 60) recommendation = "go";
  else if (totalScore < 40) recommendation = "pass";

  let competitionLevel = "medium";
  if (avgReviews < 300) competitionLevel = "low";
  else if (avgReviews < 1000) competitionLevel = "medium";
  else if (avgReviews < 5000) competitionLevel = "high";
  else competitionLevel = "extreme";

  return { trendScore, marketScore, competitionScore, profitScore, totalScore, recommendation, competitionLevel };
}

export async function POST() {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    // Get recent trends (last 7 days)
    const recentTrends = await prisma.beautyTrend.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
      orderBy: { trendScore: "desc" },
      take: 10,
    });

    if (recentTrends.length === 0) {
      return NextResponse.json({ message: "没有最近的趋势数据，请先扫描趋势" }, { status: 400 });
    }

    const trendsForAI = recentTrends.map((t) => ({
      id: t.id,
      title: t.title,
      content: t.content,
      market: t.market,
      ingredients: t.ingredients,
      category: t.category,
      trendScore: t.trendScore,
    }));

    // Generate ideas via Claude
    const ideas = await claudeJson<IdeaItem[]>({
      system: SYSTEM_PROMPT,
      user: `以下是最新扫描到的美妆趋势，请为每条趋势生成1-2个新品创意：\n\n${JSON.stringify(trendsForAI, null, 2)}\n\n请返回JSON数组。`,
    });

    if (!ideas || !Array.isArray(ideas)) {
      return NextResponse.json({ message: "AI 生成创意失败" }, { status: 500 });
    }

    // Try to get market data from sellersprite MCP
    const mcp = createSellerspriteMcpClient();
    const results: string[] = [];

    for (const idea of ideas) {
      const trendRow = recentTrends.find((t) => t.id === idea.trendId);
      const trendScoreRaw = trendRow?.trendScore ?? 50;

      let searchVolume: number | null = null;
      let avgPrice: number | null = null;
      let avgRating: number | null = null;
      let avgReviews = 500;
      let newProductRatio = 0;
      let topCompetitors: string[] = [];
      let marketDataJson: string | null = null;

      // Try MCP keyword research
      if (idea.searchKeywords?.[0]) {
        try {
          const kwRes = await mcp.callToolSafe("keyword_research", {
            keyword: idea.searchKeywords[0],
            marketplace: "us",
          });
          if (kwRes.ok && kwRes.data) {
            const kwData = typeof kwRes.data === "string" ? JSON.parse(kwRes.data) : kwRes.data;
            searchVolume = kwData.monthlySearchVolume ?? kwData.searchVolume ?? null;
            marketDataJson = JSON.stringify(kwData);
          }
        } catch {
          console.warn("[beauty-generate] MCP keyword_research failed");
        }
      }

      // Try MCP product research
      if (idea.searchKeywords?.[0]) {
        try {
          const prRes = await mcp.callToolSafe("product_research", {
            keyword: idea.searchKeywords[0],
            marketplace: "us",
          });
          if (prRes.ok && prRes.data) {
            const prData = typeof prRes.data === "string" ? JSON.parse(prRes.data) : prRes.data;
            const items = prData.items ?? prData.products ?? [];
            if (items.length > 0) {
              const prices = items.map((i: { price?: number }) => i.price).filter(Boolean) as number[];
              const ratings = items.map((i: { rating?: number }) => i.rating).filter(Boolean) as number[];
              const reviews = items.map((i: { reviews?: number; ratingsCount?: number }) => i.reviews ?? i.ratingsCount ?? 0);
              avgPrice = prices.length > 0 ? prices.reduce((a: number, b: number) => a + b, 0) / prices.length : null;
              avgRating = ratings.length > 0 ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : null;
              avgReviews = reviews.length > 0 ? reviews.reduce((a: number, b: number) => a + b, 0) / reviews.length : 500;
              topCompetitors = items.slice(0, 5).map((i: { asin?: string }) => i.asin).filter(Boolean);
              // Estimate new product ratio
              const now = Date.now();
              const oneYear = 365 * 86400_000;
              const newItems = items.filter((i: { listingDate?: string }) => {
                if (!i.listingDate) return false;
                return now - new Date(i.listingDate).getTime() < oneYear;
              });
              newProductRatio = items.length > 0 ? newItems.length / items.length : 0;
            }
          }
        } catch {
          console.warn("[beauty-generate] MCP product_research failed");
        }
      }

      const scores = calcScores({
        trendScore: trendScoreRaw,
        searchVolume,
        avgReviews,
        newProductRatio,
        estimatedPrice: idea.estimatedPrice || "$20",
        estimatedCost: idea.estimatedCost || "$5",
      });

      // Generate AI analysis report
      let aiAnalysis = `## ${idea.name}\n\n暂无详细分析报告，市场数据${searchVolume ? "已获取" : "待获取"}。`;
      if (searchVolume || avgPrice) {
        aiAnalysis = [
          `## ${idea.name} - 分析报告`,
          "",
          `### 产品概述`,
          idea.description,
          "",
          `### 市场数据`,
          `- 月搜索量：${searchVolume?.toLocaleString() ?? "未知"}`,
          `- 市场均价：${avgPrice ? `$${avgPrice.toFixed(2)}` : "未知"}`,
          `- 平均评分：${avgRating?.toFixed(1) ?? "未知"}`,
          `- 竞争程度：${scores.competitionLevel}`,
          "",
          `### 评分详情`,
          `- 趋势分：${scores.trendScore}/25`,
          `- 市场分：${scores.marketScore}/25`,
          `- 竞争分：${scores.competitionScore}/25`,
          `- 利润分：${scores.profitScore}/25`,
          `- **总分：${scores.totalScore}/100**`,
          "",
          `### 推荐意见`,
          scores.totalScore >= 75 ? "🟢 **强烈推荐** - 市场机会好，竞争适中，利润空间大" :
          scores.totalScore >= 60 ? "🔵 **推荐** - 有一定市场空间，可以考虑开发" :
          scores.totalScore >= 40 ? "🟡 **观望** - 需要更多数据验证" :
          "🔴 **放弃** - 市场竞争激烈或利润空间不足",
        ].join("\n");
      }

      const record = await prisma.productIdea.create({
        data: {
          trendId: recentTrends.find((t) => t.id === idea.trendId)?.id ?? null,
          name: idea.name,
          category: idea.category || "skincare",
          description: idea.description,
          targetMarket: idea.targetMarket || "US",
          keyIngredients: JSON.stringify(idea.keyIngredients || []),
          sellingPoints: JSON.stringify(idea.sellingPoints || []),
          estimatedPrice: idea.estimatedPrice,
          estimatedCost: idea.estimatedCost,
          marketData: marketDataJson,
          searchVolume,
          competitionLevel: scores.competitionLevel,
          avgPrice,
          avgRating,
          topCompetitors: JSON.stringify(topCompetitors),
          trendScore: scores.trendScore,
          marketScore: scores.marketScore,
          competitionScore: scores.competitionScore,
          profitScore: scores.profitScore,
          totalScore: scores.totalScore,
          recommendation: scores.recommendation,
          aiAnalysis,
          status: "draft",
          createdBy: session.user.id,
        },
      });
      results.push(record.id);
    }

    return NextResponse.json({
      ok: true,
      message: `已生成 ${results.length} 个新品创意`,
      count: results.length,
      ids: results,
    });
  } catch (e) {
    console.error("[beauty-generate]", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "生成失败" },
      { status: 500 }
    );
  }
}
