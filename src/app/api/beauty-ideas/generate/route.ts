import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { getLastClaudeUsage } from "@/lib/claude-client";
import { scoreIdeaWithKeywordMiner, buildIdeaAnalysis } from "@/lib/idea-scoring";
import { generateIdeasFromKeywords, type BlueOceanKeyword } from "@/lib/idea-data-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const { session, error } = await requireModuleAccess("beauty-ideas");
  if (error) return error;

  try {
    // Only use real data trends (sellersprite_keyword_research)
    const recentTrends = await prisma.beautyTrend.findMany({
      where: {
        createdAt: { gte: new Date(Date.now() - 7 * 86400_000) },
        source: "sellersprite_keyword_research",
      },
      orderBy: { trendScore: "desc" },
      take: 15,
    });

    if (recentTrends.length === 0) {
      return NextResponse.json({ message: "没有真实数据趋势，请先点击「扫描趋势」获取卖家精灵数据" }, { status: 400 });
    }

    // Convert DB trends back to BlueOceanKeyword format for the pipeline
    const keywords: BlueOceanKeyword[] = recentTrends.map((t) => {
      const s = parseContentNumbers(t.content);
      return {
        keyword: t.title,
        searches: s.searches,
        products: s.products,
        avgRatings: s.avgRatings,
        avgPrice: s.avgPrice,
        bid: s.bid,
        araClickRate: 0,
        supplyDemandRatio: s.supplyDemandRatio,
        growth: s.growth,
        googleTrendDirection: s.direction,
        marketplace: t.market,
      };
    });

    console.info(`[beauty-generate] 基于 ${keywords.length} 个真实关键词生成创意...`);
    const ideas = await generateIdeasFromKeywords(keywords, "beauty");

    if (ideas.length === 0) {
      return NextResponse.json({ message: "AI 生成创意失败，请重试" }, { status: 500 });
    }

    const results: string[] = [];
    for (const idea of ideas) {
      const scores = await scoreIdeaWithKeywordMiner(
        idea.searchKeywords?.[0] ?? idea.keyword ?? "",
        "US",
        "[beauty-generate]",
      );

      const trendRow = recentTrends.find((t) => t.title === idea.keyword);

      const record = await prisma.productIdea.create({
        data: {
          trendId: trendRow?.id ?? null,
          name: idea.name,
          category: idea.category || "skincare",
          description: idea.description,
          targetMarket: idea.targetMarket || "US",
          keyIngredients: JSON.stringify(idea.keyIngredients || []),
          sellingPoints: JSON.stringify(idea.sellingPoints || []),
          estimatedPrice: idea.estimatedPrice,
          estimatedCost: idea.estimatedCost,
          marketData: scores.marketDataJson,
          searchVolume: scores.searchVolume,
          competitionLevel: scores.competitionLevel,
          trendScore: scores.trendScore,
          marketScore: scores.marketScore,
          competitionScore: scores.competitionScore,
          profitScore: scores.profitScore,
          totalScore: scores.totalScore,
          recommendation: scores.recommendation,
          aiAnalysis: buildIdeaAnalysis(idea.name, idea.description, scores),
          status: "draft",
          createdBy: session!.user.id,
        },
      });
      results.push(record.id);
    }

    const usage = getLastClaudeUsage();
    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        module: "beauty-ideas",
        action: "generate",
        detail: JSON.stringify({ count: results.length }),
        tokenUsed: usage ? usage.inputTokens + usage.outputTokens : null,
      },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      message: `已生成 ${results.length} 个新品创意（基于真实数据）`,
      count: results.length,
      ids: results,
    });
  } catch (e) {
    console.error("[beauty-generate]", e);
    return NextResponse.json({ message: e instanceof Error ? e.message : "生成失败" }, { status: 500 });
  }
}

/** Parse numbers from the structured content string */
function parseContentNumbers(content: string) {
  const n = (pattern: RegExp): number => {
    const m = content.match(pattern);
    return m ? parseFloat(m[1].replace(/,/g, "")) : 0;
  };
  const dir = content.includes("上升") ? "rising" as const
    : content.includes("平稳") ? "stable" as const : "unknown" as const;
  return {
    searches: n(/月搜索量([\d,]+)/),
    growth: n(/增长率([\d.]+)%/),
    products: n(/商品数(\d+)/),
    avgRatings: n(/平均评论(\d+)/),
    supplyDemandRatio: n(/供需比([\d.]+)/),
    bid: n(/CPC\s*[€$]([\d.]+)/),
    avgPrice: 0,
    direction: dir,
  };
}
