import { NextRequest, NextResponse } from "next/server";
import { ThreeCTrend } from "@prisma/client";
import prisma from "@/lib/prisma";
import { claudeJson } from "@/lib/claude-client";
import { scoreIdeaWithKeywordMiner, buildIdeaAnalysis } from "@/lib/idea-scoring";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    const SCAN_PROMPT = `你是一位资深3C电子配件行业分析师，服务于一家亚马逊跨境3C卖家。
我们在深圳有成熟的3C配件供应链，产品主要在亚马逊美国站、欧洲站、日本站线上销售。

你的任务是扫描最新的3C电子配件趋势，包括：
- 美国市场：CES新品配件、Amazon Electronics热销榜、TikTok科技趋势
- 欧洲市场：Type-C标准机遇、环保法规新品类
- 日本市场：高品质精致配件、Amazon.co.jp热销

选品方向：手机/平板/笔电配件、智能家居小配件、桌面/办公配件、车载电子、新型充电方案
排除红海：蓝牙耳机、通用数据线、通用充电器、通用手机壳、钢化膜、移动电源
标准：售价$10-$40，体积小重量轻，模具<$5000，深圳供应链

请返回JSON数组，每个元素包含：
{
  "source": "google_trends" | "social_media" | "news" | "industry_report",
  "market": "US" | "EU" | "JP",
  "title": "趋势标题",
  "content": "趋势详细描述（100-200字）",
  "keywords": ["关键词1", "关键词2"],
  "category": "phone_accessories" | "computer_peripherals" | "smart_home" | "audio" | "wearable" | "charging" | "storage",
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
    let createdTrends = await prisma.threeCTrend.findMany({
      where: { createdAt: { gte: todayStart, lte: todayEnd } },
      orderBy: { trendScore: "desc" },
    });

    if (createdTrends.length === 0) {
      console.info("[3c-auto-scan] 开始扫描趋势...");
      const trends = await claudeJson<TrendItem[]>({
        system: SCAN_PROMPT,
        user: `请扫描当前最新的3C电子配件市场趋势（${today}），覆盖美国、欧洲、日本三个市场。只返回JSON数组，不要包含任何其他文字说明。`,
        maxTokens: 16384,
      });

      if (!trends || !Array.isArray(trends)) {
        throw new Error("AI 趋势扫描返回格式错误");
      }

      createdTrends = await prisma.$transaction(
        trends.map((t) =>
          prisma.threeCTrend.create({
            data: {
              source: t.source || "social_media",
              market: t.market || "US",
              title: t.title,
              content: t.content,
              keywords: JSON.stringify(t.keywords || []),
              category: t.category || "phone_accessories",
              trendScore: Math.min(100, Math.max(1, t.trendScore || 50)),
              sourceUrl: t.sourceUrl || null,
              scannedAt: new Date(),
            },
          })
        )
      );
      console.info(`[3c-auto-scan] 扫描到 ${createdTrends.length} 条趋势`);
    } else {
      console.info(`[3c-auto-scan] 复用今日已有 ${createdTrends.length} 条趋势`);
    }

    // ── Step 2: Generate ideas ──
    const IDEA_PROMPT = `你是一位资深3C电子产品经理，服务于亚马逊跨境3C卖家。
根据提供的趋势信息，为每条趋势生成1-2个具体的新品创意。

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

