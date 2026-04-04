import { NextRequest, NextResponse } from "next/server";
import { ThreeCTrend } from "@prisma/client";
import prisma from "@/lib/prisma";
import { claudeJson } from "@/lib/claude-client";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";
import { scoreIdeaWithKeywordMiner, buildIdeaAnalysis } from "@/lib/idea-scoring";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function extractKwItems(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.items)) return obj.items as Record<string, unknown>[];
  if (Array.isArray(obj.data)) return obj.data as Record<string, unknown>[];
  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    const inner = obj.data as Record<string, unknown>;
    if (Array.isArray(inner.items)) return inner.items as Record<string, unknown>[];
  }
  return [];
}

function safeNum(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) ? v : null;
}

/**
 * Internal auto-scan endpoint — called by instrumentation.ts scheduler.
 * Secured by x-auto-sync-secret header.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-auto-sync-secret");
  if (secret !== (process.env.AUTO_SYNC_SECRET || "__internal__")) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const existing = await prisma.dailyThreeCReport.findUnique({
    where: { reportDate: today },
  });
  if (existing && existing.status === "completed") {
    return NextResponse.json({ message: "今日已完成扫描", skipped: true });
  }

  const report = existing
    ? existing
    : await prisma.dailyThreeCReport.create({
        data: { reportDate: today, status: "generating" },
      });

  if (existing) {
    await prisma.dailyThreeCReport.update({
      where: { id: report.id },
      data: { status: "generating" },
    });
  }

  try {
    // ── Step 1: 用卖家精灵找真实蓝海关键词（替代AI编趋势） ──
    const todayStart = new Date(today + "T00:00:00Z");
    const todayEnd = new Date(today + "T23:59:59Z");
    let createdTrends = await prisma.threeCTrend.findMany({
      where: { createdAt: { gte: todayStart, lte: todayEnd } },
      orderBy: { trendScore: "desc" },
    });

    if (createdTrends.length === 0) {
      console.info("[3c-auto-scan] 用卖家精灵搜索蓝海关键词...");
      const mcp = createSellerspriteMcpClient();

      let kwRes = await mcp.callToolSafe("keyword_research", {
        request: {
          marketplace: "US",
          departments: ["pc", "wireless", "electronics"],
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
        console.info("[3c-auto-scan] 0 results, relaxing filters...");
        kwRes = await mcp.callToolSafe("keyword_research", {
          request: {
            marketplace: "US",
            departments: ["pc", "wireless", "electronics"],
            minSearches: 500,
            maxProducts: 500,
            size: 20,
            order: { field: "searches", desc: true },
          },
        });
      }

      if (!kwRes.ok) {
        throw new Error(`卖家精灵 keyword_research 失败: ${kwRes.error}`);
      }

      const kwItems = extractKwItems(kwRes.data);
      if (kwItems.length === 0) {
        throw new Error("卖家精灵未返回任何关键词数据");
      }

      console.info(`[3c-auto-scan] 获取到 ${kwItems.length} 条蓝海关键词`);

      createdTrends = await prisma.$transaction(
        kwItems.map((kw) => {
          const searches = safeNum(kw.searches) ?? 0;
          const products = safeNum(kw.products) ?? 0;
          const avgRatings = safeNum(kw.avgRatings) ?? 0;
          const sdr = safeNum(kw.supplyDemandRatio) ?? 0;
          const bid = safeNum(kw.bid) ?? 0;
          const score = Math.min(100, Math.max(1, Math.round(
            (searches >= 5000 ? 40 : searches >= 2000 ? 30 : 20) + (sdr >= 5 ? 30 : sdr >= 3 ? 20 : 10) + (products < 200 ? 30 : products < 500 ? 20 : 10)
          )));
          return prisma.threeCTrend.create({
            data: {
              source: "sellersprite_data",
              market: "US",
              title: String(kw.keywords ?? kw.keyword ?? ""),
              content: `月搜索量${searches.toLocaleString()}，商品数${products}，平均评论${Math.round(avgRatings)}条，供需比${sdr.toFixed(1)}，CPC $${bid.toFixed(2)}`,
              keywords: JSON.stringify([]),
              category: "phone_accessories",
              trendScore: score,
              sourceUrl: null,
              scannedAt: new Date(),
            },
          });
        })
      );
      console.info(`[3c-auto-scan] 写入 ${createdTrends.length} 条趋势`);
    } else {
      console.info(`[3c-auto-scan] 复用今日已有 ${createdTrends.length} 条趋势`);
    }

    // ── Step 2: Generate ideas from real keyword data ──
    const IDEA_PROMPT = `你是一位资深3C电子产品经理。以下是从亚马逊真实数据中发现的蓝海关键词，每个关键词代表一个有需求但竞争不激烈的市场机会。
请基于这些真实关键词设计具体的新品方案。注意：产品必须围绕这些真实关键词设计，不要偏离关键词对应的市场需求。

每个创意需要包含：
{
  "trendId": "关联的趋势ID",
  "name": "产品名称（中英文）",
  "category": "phone_accessories/computer_peripherals/smart_home/audio/wearable/charging/storage",
  "description": "产品描述（150-300字）",
  "targetMarket": "US",
  "keyFeatures": ["核心功能1", "功能2"],
  "sellingPoints": ["卖点1", "卖点2", "卖点3"],
  "estimatedPrice": "$15-25",
  "estimatedCost": "$3-6",
  "searchKeywords": ["amazon搜索关键词1", "关键词2"]
}

要求：售价$10-$40，轻小适合FBA，模具<$5000，排除蓝牙耳机/数据线/充电器/手机壳/钢化膜/移动电源。
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

    const trendsForAI = createdTrends.map((t: ThreeCTrend) => ({
      id: t.id,
      title: t.title,
      content: t.content,
      market: t.market,
      keywords: t.keywords,
      category: t.category,
      trendScore: t.trendScore,
    }));

    console.info("[3c-auto-scan] 开始生成创意...");
    const ideas = await claudeJson<IdeaItem[]>({
      system: IDEA_PROMPT,
      user: `以下是最新扫描到的3C趋势，请为每条趋势生成1-2个新品创意：\n\n${JSON.stringify(trendsForAI, null, 2)}\n\n只返回JSON数组，不要包含任何其他文字说明。`,
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

        const scores = await scoreIdeaWithKeywordMiner(
          idea.searchKeywords?.[0] ?? "",
          "US",
          "[3c-auto-scan]",
        );

        await prisma.threeCProductIdea.create({
          data: {
            trendId: trendRow?.id ?? null,
            name: idea.name,
            category: idea.category || "phone_accessories",
            description: idea.description,
            targetMarket: idea.targetMarket || "US",
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

    const highScoreIdeas = await prisma.threeCProductIdea.findMany({
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

    await prisma.dailyThreeCReport.update({
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
      `[3c-auto-scan] ${today} 完成: ${createdTrends.length} 趋势, ${ideasCreated} 创意, ${highScore} 高分`
    );

    return NextResponse.json({
      ok: true,
      date: today,
      trendsFound: createdTrends.length,
      ideasGenerated: ideasCreated,
      highScoreIdeas: highScore,
    });
  } catch (e) {
    console.error("[3c-auto-scan]", e);
    await prisma.dailyThreeCReport.update({
      where: { id: report.id },
      data: { status: "failed" },
    });
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "自动扫描失败" },
      { status: 500 }
    );
  }
}

