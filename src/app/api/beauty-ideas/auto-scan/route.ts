import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { claudeJson } from "@/lib/claude-client";
import { scoreIdeaWithKeywordMiner, buildIdeaAnalysis } from "@/lib/idea-scoring";

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
    // ── Step 1: Scan trends ──
    const SCAN_PROMPT = `你是一位资深美妆行业分析师，服务于一家亚马逊跨境美妆卖家。
我们在美国、中国、韩国都有供应链资源，产品主要在亚马逊和TikTok Shop线上销售。

你的任务是扫描最新的美妆趋势，包括：
- 美国市场：FDA新批准成分、Sephora/Ulta热卖新品、TikTok美妆趋势、Amazon Beauty热销榜
- 韩国市场：K-beauty新成分、Olive Young热销、韩国美妆博主推荐、创新配方技术
- 中国市场：天猫/抖音美妆爆品、新锐品牌、新原料趋势、功效护肤新方向

注意：
- 关注成分安全性（FDA合规）和市场需求
- 关注可以线上销售的产品，避免需要线下体验的品类
- 避免已经过度饱和的品类（如普通保湿面霜、基础洁面等）
- 重点关注有差异化空间的新兴趋势

请返回JSON数组，每个元素包含：
{
  "source": "google_trends" | "social_media" | "news" | "industry_report",
  "market": "US" | "KR" | "CN",
  "title": "趋势标题",
  "content": "趋势详细描述（100-200字）",
  "ingredients": ["相关成分1", "成分2"],
  "category": "skincare" | "makeup" | "haircare" | "bodycare" | "fragrance",
  "trendScore": 1-100的热度分数,
  "sourceUrl": "来源链接或null"
}

请返回8-12条最值得关注的趋势。`;

    type TrendItem = {
      source: string;
      market: string;
      title: string;
      content: string;
      ingredients: string[];
      category: string;
      trendScore: number;
      sourceUrl?: string | null;
    };

    // Reuse today's existing trends if already scanned
    const todayStart = new Date(today + "T00:00:00Z");
    const todayEnd = new Date(today + "T23:59:59Z");
    let createdTrends = await prisma.beautyTrend.findMany({
      where: { createdAt: { gte: todayStart, lte: todayEnd } },
      orderBy: { trendScore: "desc" },
    });

    if (createdTrends.length === 0) {
      console.info("[beauty-auto-scan] 开始扫描趋势...");
      const trends = await claudeJson<TrendItem[]>({
        system: SCAN_PROMPT,
        user: `请扫描当前最新的美妆市场趋势（${today}），覆盖美国、韩国、中国三个市场。只返回JSON数组，不要包含任何其他文字说明。`,
        maxTokens: 16384,
      });

      if (!trends || !Array.isArray(trends)) {
        throw new Error("AI 趋势扫描返回格式错误");
      }

      createdTrends = await prisma.$transaction(
        trends.map((t) =>
          prisma.beautyTrend.create({
            data: {
              source: t.source || "social_media",
              market: t.market || "US",
              title: t.title,
              content: t.content,
              ingredients: JSON.stringify(t.ingredients || []),
              category: t.category || "skincare",
              trendScore: Math.min(100, Math.max(1, t.trendScore || 50)),
              sourceUrl: t.sourceUrl || null,
              scannedAt: new Date(),
            },
          })
        )
      );
      console.info(`[beauty-auto-scan] 扫描到 ${createdTrends.length} 条趋势`);
    } else {
      console.info(`[beauty-auto-scan] 复用今日已有 ${createdTrends.length} 条趋势`);
    }

    // ── Step 2: Generate ideas ──
    const IDEA_PROMPT = `你是一位资深美妆产品经理，服务于亚马逊跨境美妆卖家。
根据提供的趋势信息，为每条趋势生成1-2个具体的新品创意。

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

