import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { getLastClaudeUsage } from "@/lib/claude-client";
import { scoreIdeaWithKeywordMiner, buildIdeaAnalysis } from "@/lib/idea-scoring";
import { generateIdeasFromKeywords, type BlueOceanKeyword } from "@/lib/idea-data-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const { session, error } = await requireModuleAccess("europe-ideas");
  if (error) return error;
  const userId = session.user.id;

  try {
    const recentTrends = await prisma.europeTrend.findMany({
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

    const keywords: BlueOceanKeyword[] = recentTrends.map((t) => {
      const s = parseContentNumbers(t.content);
      return {
        keyword: t.title, searches: s.searches, products: s.products,
        avgRatings: s.avgRatings, avgPrice: 0, bid: s.bid,
        araClickRate: 0, supplyDemandRatio: s.supplyDemandRatio,
        growth: s.growth, googleTrendDirection: s.direction, marketplace: t.market,
      };
    });

    console.info(`[europe-generate] 基于 ${keywords.length} 个真实关键词生成创意...`);
    const ideas = await generateIdeasFromKeywords(keywords, "europe");

    if (ideas.length === 0) {
      return NextResponse.json({ message: "AI 生成创意失败，请重试" }, { status: 500 });
    }

    const results: string[] = [];
    for (const idea of ideas) {
      const targetMarket = idea.targetMarket || keywords.find((k) => k.keyword === idea.keyword)?.marketplace || "DE";
      const scores = await scoreIdeaWithKeywordMiner(
        idea.searchKeywords?.[0] ?? idea.keyword ?? "", targetMarket, "[europe-generate]",
      );
      const trendRow = recentTrends.find((t) => t.title === idea.keyword);

      const record = await prisma.europeProductIdea.create({
        data: {
          trendId: trendRow?.id ?? null,
          name: idea.name,
          category: idea.category || "home",
          description: idea.description,
          targetMarket,
          keyFeatures: JSON.stringify(idea.keyIngredients || []),
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
          createdBy: userId,
        },
      });
      results.push(record.id);
    }

    const usage = getLastClaudeUsage();
    await prisma.activityLog.create({
      data: { userId, module: "europe-ideas", action: "generate",
        detail: JSON.stringify({ count: results.length }),
        tokenUsed: usage ? usage.inputTokens + usage.outputTokens : null },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      message: `已生成 ${results.length} 个新品创意（基于真实数据）`,
      count: results.length, ids: results,
    });
  } catch (e) {
    console.error("[europe-generate]", e);
    return NextResponse.json({ message: e instanceof Error ? e.message : "生成失败" }, { status: 500 });
  }
}

function parseContentNumbers(content: string) {
  const n = (p: RegExp): number => { const m = content.match(p); return m ? parseFloat(m[1].replace(/,/g, "")) : 0; };
  const dir = content.includes("上升") ? "rising" as const : content.includes("平稳") ? "stable" as const : "unknown" as const;
  return { searches: n(/月搜索量([\d,]+)/), growth: n(/增长率([\d.]+)%/), products: n(/商品数(\d+)/), avgRatings: n(/平均评论(\d+)/), supplyDemandRatio: n(/供需比([\d.]+)/), bid: n(/CPC\s*[€$]([\d.]+)/), direction: dir };
}
