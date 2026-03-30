import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { claudeJson } from "@/lib/claude-client";
import { scoreIdeaWithKeywordMiner, buildIdeaAnalysis } from "@/lib/idea-scoring";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SYSTEM_PROMPT = `你是一位资深欧洲跨境电商产品经理，服务于亚马逊欧洲站卖家。
我们在中国有成熟的供应链，主做亚马逊欧洲站线上销售。

根据提供的趋势信息，为每条趋势生成1-2个具体的新品创意。

每个创意需要包含：
{
  "trendId": "关联的趋势ID",
  "name": "产品名称（中英文，如：硅胶折叠漏斗 Silicone Collapsible Funnel）",
  "category": "beauty/3c_accessories/home/pet/sports/outdoor/office/fashion_accessories",
  "description": "产品描述（150-300字，说明产品是什么、怎么用、解决什么问题）",
  "targetMarket": "DE",
  "keyFeatures": ["核心功能1", "功能2", "功能3"],
  "sellingPoints": ["卖点1", "卖点2", "卖点3", "卖点4"],
  "estimatedPrice": "€15-25",
  "estimatedCost": "€3-6",
  "searchKeywords": ["amazon搜索关键词1", "关键词2", "关键词3"]
}

要求：
- 售价 ≥15 欧元，体积小重量轻（<500g）
- 排除：食品、保健品、医疗器械、儿童玩具、电池类产品、化学品、大件家具
- 目标 BSR 30-80 蓝海区间
- 优先季节性需求产品、欧洲本土品牌少的品类、复购率高的消耗品
- 差异化：有明确的差异点，不是简单的Me-too
- 适合亚马逊FBA（小包装、轻量、不易损坏）

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

export async function POST() {
  const { session, error } = await requireModuleAccess("europe-ideas");
  if (error) return error;

  try {
    const recentTrends = await prisma.europeTrend.findMany({
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
      keywords: t.keywords,
      category: t.category,
      trendScore: t.trendScore,
    }));

    console.info("[europe-generate] 开始调用 Claude API...");
    const ideas = await claudeJson<IdeaItem[]>({
      system: SYSTEM_PROMPT,
      user: `以下是最新扫描到的欧洲蓝海趋势，请为每条趋势生成1-2个新品创意：\n\n${JSON.stringify(trendsForAI, null, 2)}\n\n只返回JSON数组，不要包含任何其他文字说明。`,
      maxTokens: 16384,
    });

    console.info("[europe-generate] Claude 返回:", ideas ? `${Array.isArray(ideas) ? ideas.length : typeof ideas} 条` : "null");

    if (!ideas || !Array.isArray(ideas)) {
      return NextResponse.json({ message: "AI 生成创意失败" }, { status: 500 });
    }

    const results: string[] = [];

    for (const idea of ideas) {
      const targetMarket = idea.targetMarket || "DE";

      const scores = await scoreIdeaWithKeywordMiner(
        idea.searchKeywords?.[0] ?? "",
        targetMarket,
        "[europe-generate]",
      );

      const record = await prisma.europeProductIdea.create({
        data: {
          trendId: recentTrends.find((t) => t.id === idea.trendId)?.id ?? null,
          name: idea.name,
          category: idea.category || "home",
          description: idea.description,
          targetMarket,
          keyFeatures: JSON.stringify(idea.keyFeatures || []),
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
          aiAnalysis: buildIdeaAnalysis(idea.name, idea.description, scores, "€"),
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
    console.error("[europe-generate]", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "生成失败" },
      { status: 500 }
    );
  }
}
