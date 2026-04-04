import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { claudeJson } from "@/lib/claude-client";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";
import { scoreIdeaWithKeywordMiner, buildIdeaAnalysis } from "@/lib/idea-scoring";
import { extractKwItems, enrichWithGoogleTrends, computeTrendScore, buildTrendContent } from "@/lib/idea-trend-helpers";

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
    // ── Step 1: 用卖家精灵找真实蓝海关键词（DE/UK/FR 三站） ──
    const todayStart = new Date(today + "T00:00:00Z");
    const todayEnd = new Date(today + "T23:59:59Z");
    let createdTrends = await prisma.europeTrend.findMany({
      where: { createdAt: { gte: todayStart, lte: todayEnd } },
      orderBy: { trendScore: "desc" },
    });

    if (createdTrends.length === 0) {
      console.info("[europe-auto-scan] Step1: 卖家精灵搜索欧洲蓝海关键词...");
      const mcp = createSellerspriteMcpClient();
      const allEnriched: Array<Record<string, unknown> & { _trendDirection: string; _market: string }> = [];

      for (const market of ["DE", "UK", "FR"] as const) {
        let kwRes = await mcp.callToolSafe("keyword_research", {
          request: { marketplace: market, minSearches: 500, maxProducts: 200, minSupplyDemandRatio: 3, maxRatings: 300, maxAraClickRate: 0.7, size: 10, order: { field: "searches", desc: true } },
        });
        if (kwRes.ok && extractKwItems(kwRes.data).length === 0) {
          kwRes = await mcp.callToolSafe("keyword_research", {
            request: { marketplace: market, minSearches: 300, maxProducts: 500, size: 10, order: { field: "searches", desc: true } },
          });
        }
        if (kwRes.ok) {
          const items = extractKwItems(kwRes.data);
          console.info(`[europe-auto-scan] ${market} Step1: ${items.length} keywords`);
          // Step 2: Google Trends per market
          const enriched = await enrichWithGoogleTrends(items, market, mcp, `[europe-auto-scan:${market}]`);
          allEnriched.push(...enriched);
        } else {
          console.warn(`[europe-auto-scan] ${market} failed:`, kwRes.error);
        }
      }

      if (allEnriched.length === 0) throw new Error("卖家精灵未返回任何欧洲关键词数据");
      console.info(`[europe-auto-scan] Step1+2 完成: ${allEnriched.length} 条`);

      // Sort all: up first
      const order: Record<string, number> = { up: 0, stable: 1, unknown: 2, down: 3 };
      allEnriched.sort((a, b) => (order[a._trendDirection] ?? 2) - (order[b._trendDirection] ?? 2));

      createdTrends = await prisma.$transaction(
        allEnriched.map((kw) =>
          prisma.europeTrend.create({
            data: {
              source: "sellersprite_data",
              market: kw._market,
              title: String(kw.keywords ?? kw.keyword ?? ""),
              content: buildTrendContent(kw as Parameters<typeof buildTrendContent>[0], "€"),
              keywords: JSON.stringify([]),
              category: "home",
              trendScore: computeTrendScore(kw as Parameters<typeof computeTrendScore>[0], true),
              sourceUrl: null,
              scannedAt: new Date(),
            },
          })
        )
      );
      console.info(`[europe-auto-scan] 写入 ${createdTrends.length} 条趋势`);
    } else {
      console.info(`[europe-auto-scan] 复用今日已有 ${createdTrends.length} 条趋势`);
    }

    const IDEA_PROMPT = `你是一位资深欧洲跨境电商产品经理。以下是经过亚马逊欧洲站数据验证（低竞争高需求）且通过 Google Trends 趋势确认的蓝海关键词。
每个关键词包含真实的搜索量、商品数、评论数、供需比、CPC 和 Google 趋势方向。
请基于这些真实关键词设计具体的新品方案。注意：产品必须围绕这些真实关键词设计，不要偏离关键词对应的市场需求。优先为 Google 趋势上升的关键词设计产品。

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

      for (const idea of ideas) {
        const trendRow = createdTrends.find((t) => t.id === idea.trendId);
        const targetMarket = idea.targetMarket || trendRow?.market || "DE";

        const scores = await scoreIdeaWithKeywordMiner(
          idea.searchKeywords?.[0] ?? "",
          targetMarket,
          "[europe-auto-scan]",
        );

        await prisma.europeProductIdea.create({
          data: {
            trendId: trendRow?.id ?? null,
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
            aiAnalysis: buildIdeaAnalysis(idea.name, idea.description, scores),
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

