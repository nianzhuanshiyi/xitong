import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { claudeJson } from "@/lib/claude-client";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";
import { scoreIdeaWithKeywordMiner, buildIdeaAnalysis } from "@/lib/idea-scoring";
import { extractKwItems, enrichWithGoogleTrends, computeTrendScore, buildTrendContent } from "@/lib/idea-trend-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Internal auto-scan endpoint — called by instrumentation.ts scheduler.
 * Secured by x-auto-sync-secret header (same as mail auto-sync).
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-auto-sync-secret");
  if (secret !== (process.env.AUTO_SYNC_SECRET || "__internal__")) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // Check if already scanned today
  const existing = await prisma.dailyBeautyReport.findUnique({
    where: { reportDate: today },
  });
  if (existing && existing.status === "completed") {
    return NextResponse.json({ message: "今日已完成扫描", skipped: true });
  }

  // Create or update report record
  const report = existing
    ? existing
    : await prisma.dailyBeautyReport.create({
        data: { reportDate: today, status: "generating" },
      });

  if (!existing) {
    // already set to generating
  } else {
    await prisma.dailyBeautyReport.update({
      where: { id: report.id },
      data: { status: "generating" },
    });
  }

  try {
    // ── Step 1: 用卖家精灵找真实蓝海关键词（替代AI编趋势） ──
    const todayStart = new Date(today + "T00:00:00Z");
    const todayEnd = new Date(today + "T23:59:59Z");
    let createdTrends = await prisma.beautyTrend.findMany({
      where: { createdAt: { gte: todayStart, lte: todayEnd } },
      orderBy: { trendScore: "desc" },
    });

    if (createdTrends.length === 0) {
      // Step 1: keyword_research 找蓝海关键词
      console.info("[beauty-auto-scan] Step1: 卖家精灵搜索蓝海关键词...");
      const mcp = createSellerspriteMcpClient();

      let kwRes = await mcp.callToolSafe("keyword_research", {
        request: {
          marketplace: "US",
          departments: ["beauty"],
          minSearches: 1000,
          maxProducts: 300,
          minSupplyDemandRatio: 3,
          maxRatings: 500,
          maxAraClickRate: 0.7,
          size: 20,
          order: { field: "searches", desc: true },
        },
      });

      if (kwRes.ok && extractKwItems(kwRes.data).length === 0) {
        console.info("[beauty-auto-scan] 0 results, relaxing filters...");
        kwRes = await mcp.callToolSafe("keyword_research", {
          request: { marketplace: "US", departments: ["beauty"], minSearches: 500, maxProducts: 500, size: 20, order: { field: "searches", desc: true } },
        });
      }
      if (!kwRes.ok) throw new Error(`keyword_research 失败: ${kwRes.error}`);
      const kwItems = extractKwItems(kwRes.data);
      if (kwItems.length === 0) throw new Error("卖家精灵未返回任何关键词数据");
      console.info(`[beauty-auto-scan] Step1 完成: ${kwItems.length} 条`);

      // Step 2: Google Trends 验证每个关键词
      console.info("[beauty-auto-scan] Step2: Google Trends 验证...");
      const enriched = await enrichWithGoogleTrends(kwItems, "US", mcp, "[beauty-auto-scan]");
      console.info(`[beauty-auto-scan] Step2 完成: ${enriched.filter((e) => e._trendDirection === "up").length} 上升, ${enriched.filter((e) => e._trendDirection === "stable").length} 平稳, ${enriched.filter((e) => e._trendDirection === "down").length} 下降`);

      createdTrends = await prisma.$transaction(
        enriched.map((kw) =>
          prisma.beautyTrend.create({
            data: {
              source: "sellersprite_data",
              market: "US",
              title: String(kw.keywords ?? kw.keyword ?? ""),
              content: buildTrendContent(kw, "$"),
              ingredients: JSON.stringify([]),
              category: "skincare",
              trendScore: computeTrendScore(kw),
              sourceUrl: null,
              scannedAt: new Date(),
            },
          })
        )
      );
      console.info(`[beauty-auto-scan] 写入 ${createdTrends.length} 条趋势`);
    } else {
      console.info(`[beauty-auto-scan] 复用今日已有 ${createdTrends.length} 条趋势`);
    }

    // ── Step 3: Claude 基于真实数据设计产品概念 ──
    const IDEA_PROMPT = `你是一位资深美妆产品经理。以下是经过亚马逊数据验证（低竞争高需求）且通过 Google Trends 趋势确认的蓝海关键词。
每个关键词包含真实的搜索量、商品数、评论数、供需比、CPC 和 Google 趋势方向。
请基于这些真实关键词设计具体的新品方案。注意：产品必须围绕这些真实关键词设计，不要偏离关键词对应的市场需求。优先为 Google 趋势上升的关键词设计产品。

每个创意需要包含：
{
  "trendId": "关联的趋势ID",
  "name": "产品名称（中英文）",
  "category": "skincare/makeup/haircare/bodycare/fragrance",
  "description": "产品描述（150-300字）",
  "targetMarket": "US",
  "keyIngredients": ["核心成分1", "成分2"],
  "sellingPoints": ["卖点1", "卖点2", "卖点3"],
  "estimatedPrice": "$15-25",
  "estimatedCost": "$3-6",
  "searchKeywords": ["amazon搜索关键词1", "关键词2"]
}

要求：产品适合亚马逊线上销售，FDA合规，有差异化，定价合理。
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

    const trendsForAI = createdTrends.map((t) => ({
      id: t.id,
      title: t.title,
      content: t.content,
      market: t.market,
      ingredients: t.ingredients,
      category: t.category,
      trendScore: t.trendScore,
    }));

    console.info("[beauty-auto-scan] 开始生成创意...");
    const ideas = await claudeJson<IdeaItem[]>({
      system: IDEA_PROMPT,
      user: `以下是最新扫描到的美妆趋势，请为每条趋势生成1-2个新品创意：\n\n${JSON.stringify(trendsForAI, null, 2)}\n\n只返回JSON数组，不要包含任何其他文字说明。`,
      maxTokens: 16384,
    });

    let ideasCreated = 0;
    let highScore = 0;

    if (ideas && Array.isArray(ideas)) {
      // Get first admin user as creator for auto-generated ideas
      const admin = await prisma.user.findFirst({
        where: { role: "ADMIN" },
        select: { id: true },
      });
      const creatorId = admin?.id ?? "system";

      for (const idea of ideas) {
        const trendRow = createdTrends.find((t) => t.id === idea.trendId);

        const scores = await scoreIdeaWithKeywordMiner(
          idea.searchKeywords?.[0] ?? "",
          "US",
          "[beauty-auto-scan]",
        );

        await prisma.productIdea.create({
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
            createdBy: creatorId,
          },
        });

        ideasCreated++;
        if (scores.totalScore >= 70) highScore++;
      }
    }

    // ── Step 3: Generate report summary ──
    const trendsSummary = createdTrends
      .map(
        (t) =>
          `- **${t.title}** (${t.market}, 热度${t.trendScore}) — ${t.content.slice(0, 80)}…`
      )
      .join("\n");

    const highScoreIdeas = await prisma.productIdea.findMany({
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

    await prisma.dailyBeautyReport.update({
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
      `[beauty-auto-scan] ${today} 完成: ${createdTrends.length} 趋势, ${ideasCreated} 创意, ${highScore} 高分`
    );

    return NextResponse.json({
      ok: true,
      date: today,
      trendsFound: createdTrends.length,
      ideasGenerated: ideasCreated,
      highScoreIdeas: highScore,
    });
  } catch (e) {
    console.error("[beauty-auto-scan]", e);
    await prisma.dailyBeautyReport.update({
      where: { id: report.id },
      data: { status: "failed" },
    });
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "自动扫描失败" },
      { status: 500 }
    );
  }
}

