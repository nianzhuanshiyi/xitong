import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { claudeJson } from "@/lib/claude-client";
import {
  BEAUTY_CONFIG,
  scanBlueOceanKeywords,
  computeKeywordScore,
  buildTrendContent,
} from "@/lib/idea-data-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/* ================================================================
   Phase 1 (Brief) — auto-generated daily, ~1000 tokens output
   Scans Top 5 trends → picks 1 → returns a rich brief card
   ================================================================ */

/** Get current date in Beijing timezone (UTC+8) */
function getBeijingDate(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

type BriefResult = {
  selectedTrendIndex: number;
  productName: string;
  productNameEn: string;
  recommendation: string;
  ingredientDetails: Array<{ name: string; efficacy: string }>;
  keyIngredients: string[];
  priceRange: string;
  estimatedCost: string;
  estimatedMargin: string;
  competition: string;
  targetAudience: string;
  targetMarket: string;
  score: number;
  category: string;
  searchKeywords: string[];
};

const ideaSelect = {
  id: true,
  totalScore: true,
  recommendation: true,
  trendScore: true,
  marketScore: true,
  competitionScore: true,
  profitScore: true,
  searchVolume: true,
};

export async function POST(req: NextRequest) {
  // Auth: session (browser) or secret header (cron)
  const secret = req.headers.get("x-auto-sync-secret");
  const isCron = secret === (process.env.AUTO_SYNC_SECRET || "__internal__");

  let userId: string;
  if (isCron) {
    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true },
    });
    userId = admin?.id ?? "system";
  } else {
    const { session, error } = await requireModuleAccess("beauty-ideas");
    if (error) return error;
    userId = session!.user.id;
  }

  const today = getBeijingDate();

  // Gather dismissed categories to avoid
  const dismissed = await prisma.topPickReport.findMany({
    where: { dismissed: true },
    select: { dismissedCategories: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const avoidCategories = Array.from(
    new Set(
      dismissed
        .flatMap((d) => d.dismissedCategories.split(","))
        .filter(Boolean)
    )
  );
  const avoidHint =
    avoidCategories.length > 0
      ? `\n\n注意：用户对以下方向不感兴趣，请避开：${avoidCategories.join("、")}`
      : "";

  // Gather historical product names to avoid duplicates
  const historyReports = await prisma.topPickReport.findMany({
    where: { status: "completed" },
    select: { productName: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const pastProducts = historyReports
    .map((r) => r.productName)
    .filter(Boolean);
  const avoidProductsHint =
    pastProducts.length > 0
      ? `\n\n重要：请不要推荐以下已推荐过的产品，必须推荐一个全新的不同的产品方向：${pastProducts.join("、")}`
      : "";

  // Always create a new report (preserve history)
  const report = await prisma.topPickReport.create({
    data: { reportDate: today, status: "generating", createdBy: userId },
  });

  try {
    console.info("[top-pick-brief] Step1: 卖家精灵搜索蓝海关键词...");

    // Step 1+2: Real data from keyword_research + google_trend
    const keywords = await scanBlueOceanKeywords(BEAUTY_CONFIG);
    if (keywords.length === 0) throw new Error("未发现符合条件的蓝海关键词");
    console.info(`[top-pick-brief] 发现 ${keywords.length} 个蓝海关键词`);

    // Save real trends to DB
    const trendRecords = await prisma.$transaction(
      keywords.slice(0, 5).map((kw) =>
        prisma.beautyTrend.create({
          data: {
            source: "sellersprite_keyword_research",
            market: kw.marketplace,
            title: kw.keyword,
            content: buildTrendContent(kw),
            ingredients: JSON.stringify([]),
            category: "skincare",
            trendScore: computeKeywordScore(kw),
            scannedAt: new Date(),
          },
        })
      )
    );

    // Step 3: Claude designs ONE product from the top keyword
    const topKw = keywords[0];
    const kwDataStr = keywords.slice(0, 5).map((kw) =>
      `关键词: ${kw.keyword} | 月搜索量: ${kw.searches} | 增长率: ${kw.growth.toFixed(0)}% | 商品数: ${kw.products} | 平均评论: ${Math.round(kw.avgRatings)} | 均价: $${kw.avgPrice.toFixed(2)} | CPC: $${kw.bid.toFixed(2)} | Google趋势: ${kw.googleTrendDirection}`
    ).join("\n");

    console.info("[top-pick-brief] Step3: Claude 基于真实数据设计产品...");
    const result = await claudeJson<BriefResult>({
      system: `你是一位资深美妆产品总监。以下关键词全部来自亚马逊和Google真实数据验证，确认为蓝海机会。
请从中选出1个最适合做的方向，设计一个具体产品方案。

严格要求：禁止编造不存在的产品概念或技术。产品必须围绕给定关键词设计。${avoidHint}${avoidProductsHint}

返回JSON对象：
{
  "selectedTrendIndex": 0-4,
  "productName": "中文产品名",
  "productNameEn": "English Name",
  "recommendation": "推荐理由（200字）",
  "ingredientDetails": [{"name":"成分名","efficacy":"功效"}],
  "keyIngredients": ["成分1","成分2"],
  "priceRange": "$XX-XX",
  "estimatedCost": "$X-X",
  "estimatedMargin": "XX%",
  "competition": "low/medium/high",
  "targetAudience": "目标消费者",
  "targetMarket": "US",
  "score": 1-100,
  "category": "skincare",
  "searchKeywords": ["关键词1","关键词2"]
}`,
      user: `以下是经过双重验证的蓝海关键词：\n${kwDataStr}\n\n请选出1个设计产品方案。只返回JSON。`,
      maxTokens: 4096,
    });

    if (!result || !result.productName) {
      throw new Error("Claude 产品设计失败");
    }

    const ingredientMd = (result.ingredientDetails || [])
      .map((ing) => `### ${ing.name}\n${ing.efficacy}`)
      .join("\n\n");

    const idea = await prisma.productIdea.create({
      data: {
        trendId: trendRecords[result.selectedTrendIndex]?.id ?? trendRecords[0]?.id ?? null,
        name: result.productName,
        category: result.category || "skincare",
        description: result.recommendation,
        targetMarket: result.targetMarket || "US",
        keyIngredients: JSON.stringify(result.keyIngredients || []),
        sellingPoints: JSON.stringify([]),
        estimatedPrice: result.priceRange,
        totalScore: result.score || computeKeywordScore(topKw),
        trendScore: Math.round(computeKeywordScore(topKw) / 4),
        recommendation: result.score >= 70 ? "go" : "watch",
        searchVolume: topKw.searches,
        aiAnalysis: result.recommendation,
        status: "validated",
        createdBy: userId,
      },
    });

    await prisma.topPickReport.update({
      where: { id: report.id },
      data: {
        ideaId: idea.id,
        productName: result.productName,
        productNameEn: result.productNameEn || "",
        executiveSummary: result.recommendation,
        estimatedRetailPrice: result.priceRange || null,
        estimatedCogs: result.estimatedCost || null,
        estimatedMargin: result.estimatedMargin || null,
        keyIngredients: ingredientMd || "",
        marketAnalysis: result.targetAudience
          ? `### 目标市场\n${result.targetMarket || "US"} 市场\n\n### 目标消费者\n${result.targetAudience}`
          : "",
        briefIngredients: (result.keyIngredients || []).join(", "),
        briefCompetition: result.competition || "medium",
        briefScore: result.score || 70,
        status: "completed",
        phase: "brief",
      },
    });

    await prisma.dailyBeautyReport
      .upsert({
        where: { reportDate: today },
        create: { reportDate: today, trendsFound: keywords.length, ideasGenerated: 1, highScoreIdeas: result.score >= 70 ? 1 : 0, trendsSummary: keywords.slice(0, 5).map((k) => `- ${k.keyword} (${k.marketplace})`).join("\n"), ideasSummary: `精选：**${result.productName}**`, status: "completed" },
        update: { trendsFound: keywords.length, ideasGenerated: 1, ideasSummary: `精选：**${result.productName}**`, status: "completed" },
      })
      .catch(() => {});

    const finalReport = await prisma.topPickReport.findUnique({
      where: { id: report.id },
      include: { idea: { select: ideaSelect } },
    });

    console.info(`[top-pick-brief] 完成: ${result.productName} (score: ${result.score})`);

    return NextResponse.json({ report: finalReport, ok: true });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    const errStack = e instanceof Error ? e.stack : undefined;
    console.error("[top-pick-brief] ❌ 生成失败:", errMsg);
    if (errStack) console.error("[top-pick-brief] Stack:", errStack);
    await prisma.topPickReport.update({
      where: { id: report.id },
      data: { status: "failed" },
    });
    return NextResponse.json(
      { message: errMsg || "生成失败" },
      { status: 500 }
    );
  }
}

// ── GET: Latest top pick report ─────────────────────────────────

export async function GET() {
  const { error } = await requireModuleAccess("beauty-ideas");
  if (error) return error;

  // Return the latest non-dismissed completed report
  const report = await prisma.topPickReport.findFirst({
    where: { dismissed: false, status: "completed" },
    orderBy: { createdAt: "desc" },
    include: { idea: { select: ideaSelect } },
  });

  return NextResponse.json({ report: report ?? null });
}

// ── PATCH: Dismiss a report ─────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const { session, error } = await requireModuleAccess("beauty-ideas");
  if (error) return error;

  const body = await req.json();
  const { id, action } = body as { id: string; action: string };

  if (action === "dismiss") {
    const rpt = await prisma.topPickReport.findUnique({ where: { id } });
    if (!rpt) {
      return NextResponse.json({ message: "不存在" }, { status: 404 });
    }
    if (rpt.createdBy !== session!.user.id) {
      return NextResponse.json({ message: "无权操作" }, { status: 403 });
    }
    const idea = rpt.ideaId
      ? await prisma.productIdea.findUnique({
          where: { id: rpt.ideaId },
          select: { category: true },
        })
      : null;

    await prisma.topPickReport.update({
      where: { id },
      data: {
        dismissed: true,
        dismissedCategories: [rpt.dismissedCategories, idea?.category]
          .filter(Boolean)
          .join(","),
      },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ message: "未知操作" }, { status: 400 });
}
