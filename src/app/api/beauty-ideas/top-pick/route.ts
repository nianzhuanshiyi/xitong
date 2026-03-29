import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { claudeJson } from "@/lib/claude-client";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";

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

type TrendItem = {
  source: string;
  market: string;
  title: string;
  content: string;
  ingredients: string[];
  category: string;
  trendScore: number;
};

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
    const session = await requireDashboardSession();
    if (!session) {
      return NextResponse.json({ message: "未登录" }, { status: 401 });
    }
    userId = session.user.id;
  }

  const today = getBeijingDate();

  // Check if force regeneration is requested
  const body = await req.text();
  let forceRegenerate = false;
  try {
    if (body) {
      const parsed = JSON.parse(body);
      forceRegenerate = parsed.force === true;
    }
  } catch { /* empty body is fine */ }

  // Already have a completed brief/deep for today?
  const existing = await prisma.topPickReport.findUnique({
    where: { reportDate: today },
    include: { idea: { select: ideaSelect } },
  });

  if (
    existing &&
    existing.status === "completed" &&
    !existing.dismissed &&
    !forceRegenerate &&
    // Has valid brief data (not old format)
    existing.briefScore > 0
  ) {
    return NextResponse.json({ report: existing, skipped: true });
  }

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

  // Create / reset report
  const report = existing
    ? await prisma.topPickReport.update({
        where: { id: existing.id },
        data: { status: "generating", dismissed: false, phase: "brief" },
      })
    : await prisma.topPickReport.create({
        data: { reportDate: today, status: "generating", createdBy: userId },
      });

  try {
    console.info("[top-pick-brief] 开始生成简报...");

    const BRIEF_SYSTEM = `你是一位资深美妆行业分析师+产品总监，服务于亚马逊跨境美妆卖家。
公司在美国、中国、韩国都有供应链，主做亚马逊和TikTok Shop线上销售。

任务：
1. 扫描当前 Top 5 美妆趋势
2. 从中选出 1 个最适合我们做的产品方向
3. 给出详细的推荐简报

选择标准：趋势热度高、竞争可进入、毛利率≥60%、我们供应链能做、适合线上销售。
避开已饱和品类（普通保湿面霜、基础洁面等）。${avoidHint}

返回JSON对象：
{
  "trends": [
    {"source":"social_media","market":"US","title":"趋势标题","content":"50字描述","ingredients":["成分1"],"category":"skincare","trendScore":85},
    ... 共5条
  ],
  "selectedTrendIndex": 0-4,
  "productName": "中文产品名",
  "productNameEn": "English Product Name",
  "recommendation": "2-3句话详细推荐理由，说明为什么选这个方向、市场机会在哪、我们的优势是什么",
  "ingredientDetails": [
    {"name": "成分名", "efficacy": "功效说明（1-2句话）"},
    {"name": "成分名2", "efficacy": "功效说明"},
    {"name": "成分名3", "efficacy": "功效说明"}
  ],
  "keyIngredients": ["成分1","成分2","成分3"],
  "priceRange": "$18-25",
  "estimatedCost": "$4-6",
  "estimatedMargin": "65%",
  "competition": "low/medium/high",
  "targetAudience": "目标消费者画像，如'25-35岁注重护肤的女性，偏好天然成分'",
  "targetMarket": "US",
  "score": 1-100的推荐信心分,
  "category": "skincare",
  "searchKeywords": ["amazon关键词1","关键词2"]
}`;

    const result = await claudeJson<{
      trends: TrendItem[];
    } & BriefResult>({
      system: BRIEF_SYSTEM,
      user: `今天是${today}，请完成趋势扫描+精选推荐。只返回JSON对象。`,
      maxTokens: 4096,
    });

    if (!result) {
      console.error("[top-pick-brief] ❌ claudeJson 返回 null（API 调用可能失败或返回空）");
      throw new Error("简报生成失败：Claude API 返回空结果");
    }
    if (!result.productName) {
      console.error("[top-pick-brief] ❌ Claude 返回了 JSON 但缺少 productName, keys:", Object.keys(result));
      throw new Error("简报生成失败：返回数据缺少产品名称");
    }

    // Save trends
    const trendItems = (result.trends || []).slice(0, 5);
    if (trendItems.length > 0) {
      await prisma.$transaction(
        trendItems.map((t) =>
          prisma.beautyTrend.create({
            data: {
              source: t.source || "social_media",
              market: t.market || "US",
              title: t.title,
              content: t.content,
              ingredients: JSON.stringify(t.ingredients || []),
              category: t.category || "skincare",
              trendScore: Math.min(100, Math.max(1, t.trendScore || 70)),
              scannedAt: new Date(),
            },
          })
        )
      );
    }

    // Optional: Sellersprite quick check
    let searchVolume: number | null = null;
    if (result.searchKeywords?.[0]) {
      try {
        const mcp = createSellerspriteMcpClient();
        const kwRes = await mcp.callToolSafe("keyword_research", {
          keyword: result.searchKeywords[0],
          marketplace: "us",
        });
        if (kwRes.ok && kwRes.data) {
          const d = typeof kwRes.data === "string" ? JSON.parse(kwRes.data) : kwRes.data;
          searchVolume = d.monthlySearchVolume ?? d.searchVolume ?? null;
        }
      } catch { /* non-blocking */ }
    }

    // Build ingredient markdown for brief display
    const ingredientMd = (result.ingredientDetails || [])
      .map((ing) => `### ${ing.name}\n${ing.efficacy}`)
      .join("\n\n");

    // Create ProductIdea for relation
    const selectedTrend = trendItems[result.selectedTrendIndex] ?? trendItems[0];
    const idea = await prisma.productIdea.create({
      data: {
        name: result.productName,
        category: result.category || selectedTrend?.category || "skincare",
        description: result.recommendation,
        targetMarket: result.targetMarket || "US",
        keyIngredients: JSON.stringify(result.keyIngredients || []),
        sellingPoints: JSON.stringify([]),
        estimatedPrice: result.priceRange,
        totalScore: result.score || selectedTrend?.trendScore || 70,
        trendScore: Math.round(((selectedTrend?.trendScore || 70) / 100) * 25),
        recommendation: result.score >= 75 ? "go" : "watch",
        searchVolume,
        aiAnalysis: result.recommendation,
        status: "validated",
        createdBy: userId,
      },
    });

    // Save brief report — populate more fields for richer brief display
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
        // Store ingredient details as markdown even in brief phase
        keyIngredients: ingredientMd || "",
        // Store target audience in marketAnalysis for brief display
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

    // Also update daily report
    await prisma.dailyBeautyReport
      .upsert({
        where: { reportDate: today },
        create: {
          reportDate: today,
          trendsFound: trendItems.length,
          ideasGenerated: 1,
          highScoreIdeas: result.score >= 70 ? 1 : 0,
          trendsSummary: trendItems.map((t) => `- ${t.title} (${t.market})`).join("\n"),
          ideasSummary: `精选：**${result.productName}** — ${result.recommendation}`,
          status: "completed",
        },
        update: {
          trendsFound: trendItems.length,
          ideasGenerated: 1,
          ideasSummary: `精选：**${result.productName}** — ${result.recommendation}`,
          status: "completed",
        },
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
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const today = getBeijingDate();

  // Try today's report first (Beijing time)
  let report = await prisma.topPickReport.findUnique({
    where: { reportDate: today },
    include: { idea: { select: ideaSelect } },
  });

  // Show today's report if it's completed and not dismissed
  if (report && report.status === "completed" && !report.dismissed) {
    return NextResponse.json({ report });
  }

  // Otherwise, get the latest non-dismissed completed report
  report = await prisma.topPickReport.findFirst({
    where: { dismissed: false, status: "completed" },
    orderBy: { createdAt: "desc" },
    include: { idea: { select: ideaSelect } },
  });

  return NextResponse.json({ report: report ?? null });
}

// ── PATCH: Dismiss a report ─────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = await req.json();
  const { id, action } = body as { id: string; action: string };

  if (action === "dismiss") {
    const rpt = await prisma.topPickReport.findUnique({ where: { id } });
    if (!rpt) {
      return NextResponse.json({ message: "不存在" }, { status: 404 });
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
