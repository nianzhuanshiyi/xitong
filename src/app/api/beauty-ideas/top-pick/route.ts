import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { claudeJson } from "@/lib/claude-client";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/* ================================================================
   Phase 1 (Brief) — auto-generated daily, ~500 tokens output
   Scans Top 5 trends → picks 1 → returns a brief card
   ================================================================ */

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
  keyIngredients: string[];
  priceRange: string;
  estimatedMargin: string;
  competition: string;
  score: number;
  category: string;
  searchKeywords: string[];
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

  const today = new Date().toISOString().slice(0, 10);

  // Already have a non-dismissed brief/deep for today?
  const existing = await prisma.topPickReport.findUnique({
    where: { reportDate: today },
  });
  if (existing && existing.status !== "failed" && !existing.dismissed) {
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
    // ── Combined: scan trends + pick 1 + brief (1 Claude call) ──
    console.info("[top-pick-brief] 开始生成简报...");

    const BRIEF_SYSTEM = `你是一位资深美妆行业分析师+产品总监，服务于亚马逊跨境美妆卖家。
公司在美国、中国、韩国都有供应链，主做亚马逊和TikTok Shop线上销售。

任务（省token，简洁输出）：
1. 先扫描当前 Top 5 美妆趋势
2. 从中选出 1 个最适合我们做的产品方向
3. 给出简要推荐

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
  "productNameEn": "English Name",
  "recommendation": "1-2句话推荐理由",
  "keyIngredients": ["核心成分1","成分2","成分3"],
  "priceRange": "$18-25",
  "estimatedMargin": "65%",
  "competition": "low/medium/high",
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

    if (!result || !result.productName) {
      throw new Error("简报生成失败");
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

    // Create ProductIdea for relation
    const selectedTrend = trendItems[result.selectedTrendIndex] ?? trendItems[0];
    const idea = await prisma.productIdea.create({
      data: {
        name: result.productName,
        category: result.category || selectedTrend?.category || "skincare",
        description: result.recommendation,
        targetMarket: "US",
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

    // Save brief report
    await prisma.topPickReport.update({
      where: { id: report.id },
      data: {
        ideaId: idea.id,
        productName: result.productName,
        productNameEn: result.productNameEn || "",
        executiveSummary: result.recommendation,
        estimatedRetailPrice: result.priceRange || null,
        estimatedMargin: result.estimatedMargin || null,
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
      include: {
        idea: {
          select: {
            id: true, totalScore: true, recommendation: true,
            trendScore: true, marketScore: true, competitionScore: true,
            profitScore: true, searchVolume: true,
          },
        },
      },
    });

    console.info(`[top-pick-brief] 完成: ${result.productName} (score: ${result.score})`);

    return NextResponse.json({ report: finalReport, ok: true });
  } catch (e) {
    console.error("[top-pick-brief]", e);
    await prisma.topPickReport.update({
      where: { id: report.id },
      data: { status: "failed" },
    });
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "生成失败" },
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

  const report = await prisma.topPickReport.findFirst({
    where: { dismissed: false },
    orderBy: { createdAt: "desc" },
    include: {
      idea: {
        select: {
          id: true, totalScore: true, recommendation: true,
          trendScore: true, marketScore: true, competitionScore: true,
          profitScore: true, searchVolume: true,
        },
      },
    },
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
    // Figure out what category to avoid
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
