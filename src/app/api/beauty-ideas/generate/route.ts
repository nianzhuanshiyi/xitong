import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { claudeJson, getLastClaudeUsage } from "@/lib/claude-client";
import { scoreIdeaWithKeywordMiner, buildIdeaAnalysis } from "@/lib/idea-scoring";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SYSTEM_PROMPT = `你是一位资深美妆产品经理。以下关键词全部来自亚马逊和Google真实数据验证，确认为"需求增长中+竞争低"的蓝海机会。
每个关键词包含真实的搜索量、增长率、商品数、评论数、CPC和Google趋势方向。
请基于每个关键词的真实市场数据设计具体产品方案。严禁编造不存在的产品概念或技术。每个产品必须围绕对应的亚马逊搜索关键词设计。

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

export async function POST() {
  const { session, error } = await requireModuleAccess("beauty-ideas");
  if (error) return error;

  try {
    const recentTrends = await prisma.beautyTrend.findMany({
      where: {
        createdAt: { gte: new Date(Date.now() - 7 * 86400_000) },
        source: "sellersprite_keyword_research",
      },
      orderBy: { trendScore: "desc" },
      take: 10,
    });

    if (recentTrends.length === 0) {
      return NextResponse.json({ message: "没有真实数据趋势，请先点击「扫描趋势」获取卖家精灵数据" }, { status: 400 });
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

    console.info("[beauty-generate] 开始调用 Claude API...");
    const ideas = await claudeJson<IdeaItem[]>({
      system: SYSTEM_PROMPT,
      user: `以下是最新扫描到的美妆趋势，请为每条趋势生成1-2个新品创意：\n\n${JSON.stringify(trendsForAI, null, 2)}\n\n只返回JSON数组，不要包含任何其他文字说明。`,
      maxTokens: 16384,
    });

    console.info("[beauty-generate] Claude 返回:", ideas ? `${Array.isArray(ideas) ? ideas.length : typeof ideas} 条` : "null");

    if (!ideas || !Array.isArray(ideas)) {
      return NextResponse.json({ message: "AI 生成创意失败" }, { status: 500 });
    }

    const results: string[] = [];

    for (const idea of ideas) {
      // Data-driven scoring via keyword_miner
      const scores = await scoreIdeaWithKeywordMiner(
        idea.searchKeywords?.[0] ?? "",
        "US",
        "[beauty-generate]",
      );

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
