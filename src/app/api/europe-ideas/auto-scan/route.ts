import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { claudeJson } from "@/lib/claude-client";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-auto-sync-secret");
  if (secret !== (process.env.AUTO_SYNC_SECRET || "__internal__")) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const existing = await prisma.dailyEuropeReport.findUnique({
    where: { reportDate: today },
  });
  if (existing && existing.status === "completed") {
    return NextResponse.json({ message: "今日已完成扫描", skipped: true });
  }

  const report = existing
    ? existing
    : await prisma.dailyEuropeReport.create({
        data: { reportDate: today, status: "generating" },
      });

  if (existing) {
    await prisma.dailyEuropeReport.update({
      where: { id: report.id },
      data: { status: "generating" },
    });
  }

  try {
    const SCAN_PROMPT = `你是一位资深欧洲跨境电商选品分析师，服务于一家亚马逊欧洲站卖家。
我们在中国有成熟的供应链，产品主要在亚马逊欧洲站（DE/UK/FR/IT/ES）线上销售。

你的任务是扫描欧洲市场最新的蓝海产品趋势，包括：
- Amazon 欧洲各站 New Releases、Movers & Shakers、Best Sellers
- Google Trends 欧洲区域
- TikTok/Instagram 欧洲热门产品

选品方向：美妆个护、3C配件、家居、宠物、运动户外、办公用品、时尚配饰
排除：食品、保健品、医疗器械、儿童玩具、电池类、化学品、大件家具
标准：售价≥15欧元，BSR 30-80蓝海区间，<500g，中国供应链优势

请返回JSON数组，每个元素包含：
{
  "source": "google_trends" | "social_media" | "news" | "industry_report" | "amazon_bestseller",
  "market": "DE" | "UK" | "FR" | "IT" | "ES",
  "title": "趋势标题",
  "content": "趋势详细描述（100-200字）",
  "keywords": ["关键词1", "关键词2"],
  "category": "beauty" | "3c_accessories" | "home" | "pet" | "sports" | "outdoor" | "office" | "fashion_accessories",
  "trendScore": 1-100的热度分数,
  "sourceUrl": "来源链接或null"
}

请返回8-12条最值得关注的趋势。`;

    type TrendItem = {
      source: string;
      market: string;
      title: string;
      content: string;
      keywords: string[];
      category: string;
      trendScore: number;
      sourceUrl?: string | null;
    };

    const todayStart = new Date(today + "T00:00:00Z");
    const todayEnd = new Date(today + "T23:59:59Z");
    let createdTrends = await prisma.europeTrend.findMany({
      where: { createdAt: { gte: todayStart, lte: todayEnd } },
      orderBy: { trendScore: "desc" },
    });

    if (createdTrends.length === 0) {
      console.info("[europe-auto-scan] 开始扫描趋势...");
      const trends = await claudeJson<TrendItem[]>({
        system: SCAN_PROMPT,
        user: `请扫描当前最新的欧洲蓝海产品趋势（${today}），覆盖DE、UK、FR、IT、ES五个市场。只返回JSON数组，不要包含任何其他文字说明。`,
        maxTokens: 16384,
      });

      if (!trends || !Array.isArray(trends)) {
        throw new Error("AI 趋势扫描返回格式错误");
      }

      createdTrends = await prisma.$transaction(
        trends.map((t) =>
          prisma.europeTrend.create({
            data: {
              source: t.source || "social_media",
              market: t.market || "DE",
              title: t.title,
              content: t.content,
              keywords: JSON.stringify(t.keywords || []),
              category: t.category || "home",
              trendScore: Math.min(100, Math.max(1, t.trendScore || 50)),
              sourceUrl: t.sourceUrl || null,
              scannedAt: new Date(),
            },
          })
        )
      );
      console.info(`[europe-auto-scan] 扫描到 ${createdTrends.length} 条趋势`);
    } else {
      console.info(`[europe-auto-scan] 复用今日已有 ${createdTrends.length} 条趋势`);
    }

    const IDEA_PROMPT = `你是一位资深欧洲跨境电商产品经理，服务于亚马逊欧洲站卖家。
根据提供的趋势信息，为每条趋势生成1-2个具体的新品创意。

每个创意需要包含：
{
  "trendId": "关联的趋势ID",
  "name": "产品名称（中英文）",
  "category": "beauty/3c_accessories/home/pet/sports/outdoor/office/fashion_accessories",
  "description": "产品描述（150-300字）",
  "targetMarket": "DE",
  "keyFeatures": ["核心功能1", "功能2"],
  "sellingPoints": ["卖点1", "卖点2", "卖点3"],
  "estimatedPrice": "€15-25",
  "estimatedCost": "€3-6",
  "searchKeywords": ["amazon搜索关键词1", "关键词2"]
}

要求：售价≥15欧元，<500g适合FBA，排除食品/保健品/医疗器械/儿童玩具/电池类/化学品/大件家具。
请返回JSON数组。`;

    type IdeaItem = {
      trendId: string;
      name: string;
      category: string;
      description: string;
      targetMarket: string;
      keyFeatures: string[];
      sellingPoints: string[];
      estimatedPrice: string;
      estimatedCost: string;
      searchKeywords: string[];
    };

    const trendsForAI = createdTrends.map((t) => ({
      id: t.id,
      title: t.title,
      content: t.content,
      market: t.market,
      keywords: t.keywords,
      category: t.category,
      trendScore: t.trendScore,
    }));

    console.info("[europe-auto-scan] 开始生成创意...");
    const ideas = await claudeJson<IdeaItem[]>({
      system: IDEA_PROMPT,
      user: `以下是最新扫描到的欧洲蓝海趋势，请为每条趋势生成1-2个新品创意：\n\n${JSON.stringify(trendsForAI, null, 2)}\n\n只返回JSON数组，不要包含任何其他文字说明。`,
      maxTokens: 16384,
    });

    let ideasCreated = 0;
    let highScore = 0;

    if (ideas && Array.isArray(ideas)) {
      const admin = await prisma.user.findFirst({
        where: { role: "ADMIN" },
        select: { id: true },
      });
      const creatorId = admin?.id ?? "system";

      const mcp = createSellerspriteMcpClient();

      for (const idea of ideas) {
        const trendRow = createdTrends.find((t) => t.id === idea.trendId);
        const trendScoreRaw = trendRow?.trendScore ?? 50;
        const targetMarket = idea.targetMarket || trendRow?.market || "DE";
        const marketplace = targetMarket.toLowerCase() === "uk" ? "uk" : targetMarket.toLowerCase() === "fr" ? "fr" : "de";

        let searchVolume: number | null = null;
        let avgPrice: number | null = null;
        let avgRating: number | null = null;
        let avgReviews = 500;
        let newProductRatio = 0;
        let topCompetitors: string[] = [];
        let marketDataJson: string | null = null;

        if (idea.searchKeywords?.[0]) {
          try {
            const kwRes = await mcp.callToolSafe("keyword_research", {
              keyword: idea.searchKeywords[0],
              marketplace,
            });
            if (kwRes.ok && kwRes.data) {
              const kwData =
                typeof kwRes.data === "string"
                  ? JSON.parse(kwRes.data)
                  : kwRes.data;
              searchVolume =
                kwData.monthlySearchVolume ?? kwData.searchVolume ?? null;
              marketDataJson = JSON.stringify(kwData);
            }
          } catch {
            /* ignore */
          }
        }

        if (idea.searchKeywords?.[0]) {
          try {
            const prRes = await mcp.callToolSafe("product_research", {
              keyword: idea.searchKeywords[0],
              marketplace,
            });
            if (prRes.ok && prRes.data) {
              const prData =
                typeof prRes.data === "string"
                  ? JSON.parse(prRes.data)
                  : prRes.data;
              const items = prData.items ?? prData.products ?? [];
              if (items.length > 0) {
                const prices = items
                  .map((i: { price?: number }) => i.price)
                  .filter(Boolean) as number[];
                const ratings = items
                  .map((i: { rating?: number }) => i.rating)
                  .filter(Boolean) as number[];
                const reviews = items.map(
                  (i: { reviews?: number; ratingsCount?: number }) =>
                    i.reviews ?? i.ratingsCount ?? 0
                );
                avgPrice =
                  prices.length > 0
                    ? prices.reduce((a: number, b: number) => a + b, 0) /
                      prices.length
                    : null;
                avgRating =
                  ratings.length > 0
                    ? ratings.reduce((a: number, b: number) => a + b, 0) /
                      ratings.length
                    : null;
                avgReviews =
                  reviews.length > 0
                    ? reviews.reduce((a: number, b: number) => a + b, 0) /
                      reviews.length
                    : 500;
                topCompetitors = items
                  .slice(0, 5)
                  .map((i: { asin?: string }) => i.asin)
                  .filter(Boolean);
                const now = Date.now();
                const oneYear = 365 * 86400_000;
                const newItems = items.filter(
                  (i: { listingDate?: string }) => {
                    if (!i.listingDate) return false;
                    return now - new Date(i.listingDate).getTime() < oneYear;
                  }
                );
                newProductRatio =
                  items.length > 0 ? newItems.length / items.length : 0;
              }
            }
          } catch {
            /* ignore */
          }
        }

        const scores = calcScores({
          trendScore: trendScoreRaw,
          searchVolume,
          avgReviews,
          newProductRatio,
          estimatedPrice: idea.estimatedPrice || "€20",
          estimatedCost: idea.estimatedCost || "€5",
        });

        await prisma.europeProductIdea.create({
          data: {
            trendId: trendRow?.id ?? null,
            name: idea.name,
            category: idea.category || "home",
            description: idea.description,
            targetMarket: targetMarket,
            keyFeatures: JSON.stringify(idea.keyFeatures || []),
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
            aiAnalysis: buildAnalysis(idea.name, idea.description, searchVolume, avgPrice, avgRating, scores),
            status: "draft",
            createdBy: creatorId,
          },
        });

        ideasCreated++;
        if (scores.totalScore >= 70) highScore++;
      }
    }

    const trendsSummary = createdTrends
      .map(
        (t) =>
          `- **${t.title}** (${t.market}, 热度${t.trendScore}) — ${t.content.slice(0, 80)}…`
      )
      .join("\n");

    const highScoreIdeas = await prisma.europeProductIdea.findMany({
      where: {
        totalScore: { gte: 70 },
        createdAt: { gte: new Date(today + "T00:00:00Z") },
      },
      orderBy: { totalScore: "desc" },
      take: 5,
    });

    const ideasSummary = highScoreIdeas.length > 0
      ? highScoreIdeas
          .map(
            (i) =>
              `- **${i.name}** — 总分 ${i.totalScore}（趋势${i.trendScore}/市场${i.marketScore}/竞争${i.competitionScore}/利润${i.profitScore}）`
          )
          .join("\n")
      : "今日无高分创意（≥70分）";

    await prisma.dailyEuropeReport.update({
      where: { id: report.id },
      data: {
        trendsFound: createdTrends.length,
        ideasGenerated: ideasCreated,
        highScoreIdeas: highScore,
        trendsSummary,
        ideasSummary,
        status: "completed",
      },
    });

    console.info(
      `[europe-auto-scan] ${today} 完成: ${createdTrends.length} 趋势, ${ideasCreated} 创意, ${highScore} 高分`
    );

    return NextResponse.json({
      ok: true,
      date: today,
      trendsFound: createdTrends.length,
      ideasGenerated: ideasCreated,
      highScoreIdeas: highScore,
    });
  } catch (e) {
    console.error("[europe-auto-scan]", e);
    await prisma.dailyEuropeReport.update({
      where: { id: report.id },
      data: { status: "failed" },
    });
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "自动扫描失败" },
      { status: 500 }
    );
  }
}

function calcScores(idea: {
  trendScore: number;
  searchVolume: number | null;
  avgReviews?: number;
  newProductRatio?: number;
  estimatedPrice: string;
  estimatedCost: string;
}) {
  const trendScore = Math.round((idea.trendScore / 100) * 25);

  let marketScore = 5;
  if (idea.searchVolume) {
    if (idea.searchVolume >= 50000) marketScore = 25;
    else if (idea.searchVolume >= 20000) marketScore = 20;
    else if (idea.searchVolume >= 10000) marketScore = 16;
    else if (idea.searchVolume >= 5000) marketScore = 12;
    else if (idea.searchVolume >= 2000) marketScore = 8;
  }

  let competitionScore = 13;
  const avgReviews = idea.avgReviews ?? 500;
  if (avgReviews < 100) competitionScore = 25;
  else if (avgReviews < 300) competitionScore = 20;
  else if (avgReviews < 500) competitionScore = 16;
  else if (avgReviews < 1000) competitionScore = 12;
  else if (avgReviews < 3000) competitionScore = 8;
  else if (avgReviews < 5000) competitionScore = 4;
  else competitionScore = 2;
  if (idea.newProductRatio && idea.newProductRatio > 0.3) {
    competitionScore = Math.min(25, competitionScore + 3);
  }

  let profitScore = 10;
  const priceMatch = idea.estimatedPrice.match(/[€$]?(\d+)/);
  const costMatch = idea.estimatedCost.match(/[€$]?(\d+)/);
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

  return {
    trendScore,
    marketScore,
    competitionScore,
    profitScore,
    totalScore,
    recommendation,
    competitionLevel,
  };
}

function buildAnalysis(
  name: string,
  description: string,
  searchVolume: number | null,
  avgPrice: number | null,
  avgRating: number | null,
  scores: ReturnType<typeof calcScores>
) {
  if (!searchVolume && !avgPrice) {
    return `## ${name}\n\n暂无详细分析报告，市场数据待获取。`;
  }
  return [
    `## ${name} - 分析报告`,
    "",
    `### 产品概述`,
    description,
    "",
    `### 市场数据`,
    `- 月搜索量：${searchVolume?.toLocaleString() ?? "未知"}`,
    `- 市场均价：${avgPrice ? `€${avgPrice.toFixed(2)}` : "未知"}`,
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
    scores.totalScore >= 75
      ? "**强烈推荐** - 市场机会好，竞争适中，利润空间大"
      : scores.totalScore >= 60
        ? "**推荐** - 有一定市场空间，可以考虑开发"
        : scores.totalScore >= 40
          ? "**观望** - 需要更多数据验证"
          : "**放弃** - 市场竞争激烈或利润空间不足",
  ].join("\n");
}
