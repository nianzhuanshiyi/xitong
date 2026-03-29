import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { claudeJson } from "@/lib/claude-client";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function getBeijingDate(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

type TrendItem = {
  source: string;
  market: string;
  title: string;
  content: string;
  keywords: string[];
  category: string;
  trendScore: number;
};

type BriefResult = {
  selectedTrendIndex: number;
  productName: string;
  productNameEn: string;
  recommendation: string;
  featureDetails: Array<{ name: string; description: string }>;
  keyFeatures: string[];
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

  const dismissed = await prisma.europeTopPickReport.findMany({
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
  const historyReports = await prisma.europeTopPickReport.findMany({
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
  const report = await prisma.europeTopPickReport.create({
    data: { reportDate: today, status: "generating", createdBy: userId },
  });

  try {
    console.info("[europe-top-pick-brief] 开始生成简报...");

    const BRIEF_SYSTEM = `你是一位资深欧洲跨境电商选品分析师+产品总监，服务于亚马逊欧洲站卖家。
公司在中国有成熟的供应链，主做亚马逊欧洲站（DE/UK/FR/IT/ES）线上销售。

任务：
1. 扫描当前 Top 5 的欧洲蓝海产品趋势
2. 从中选出 1 个最适合我们做的产品方向
3. 给出详细的推荐简报

选择标准：
- 趋势热度高、竞争可进入（BSR 30-80蓝海区间）、毛利率≥60%
- 售价 ≥15 欧元，体积小重量轻（<500g），适合亚马逊FBA
- 中国供应链有优势，可快速出货
- 优先季节性需求产品、欧洲本土品牌少的品类、复购率高的消耗品

排除品类：食品、保健品、医疗器械、儿童玩具、电池类产品、化学品、大件家具${avoidHint}${avoidProductsHint}

返回JSON对象：
{
  "trends": [
    {"source":"amazon_bestseller","market":"DE","title":"趋势标题","content":"50字描述","keywords":["关键词1"],"category":"home","trendScore":85},
    ... 共5条
  ],
  "selectedTrendIndex": 0-4,
  "productName": "中文产品名",
  "productNameEn": "English Product Name",
  "recommendation": "2-3句话详细推荐理由，说明为什么选这个方向、欧洲市场机会在哪、我们的供应链优势是什么",
  "featureDetails": [
    {"name": "功能名", "description": "功能说明（1-2句话）"},
    {"name": "功能名2", "description": "功能说明"},
    {"name": "功能名3", "description": "功能说明"}
  ],
  "keyFeatures": ["功能1","功能2","功能3"],
  "priceRange": "€18-25",
  "estimatedCost": "€4-6",
  "estimatedMargin": "65%",
  "competition": "low/medium/high",
  "targetAudience": "目标消费者画像，如'25-45岁的德国家庭主妇，注重产品环保和品质'",
  "targetMarket": "DE",
  "score": 1-100的推荐信心分,
  "category": "home",
  "searchKeywords": ["amazon关键词1","关键词2"]
}`;

    const result = await claudeJson<{
      trends: TrendItem[];
    } & BriefResult>({
      system: BRIEF_SYSTEM,
      user: `今天是${today}，请完成欧洲蓝海产品趋势扫描+精选推荐。只返回JSON对象。`,
      maxTokens: 4096,
    });

    if (!result) {
      console.error("[europe-top-pick-brief] claudeJson 返回 null");
      throw new Error("简报生成失败：Claude API 返回空结果");
    }
    if (!result.productName) {
      console.error("[europe-top-pick-brief] Claude 返回了 JSON 但缺少 productName, keys:", Object.keys(result));
      throw new Error("简报生成失败：返回数据缺少产品名称");
    }

    const trendItems = (result.trends || []).slice(0, 5);
    if (trendItems.length > 0) {
      await prisma.$transaction(
        trendItems.map((t) =>
          prisma.europeTrend.create({
            data: {
              source: t.source || "social_media",
              market: t.market || "DE",
              title: t.title,
              content: t.content,
              keywords: JSON.stringify(t.keywords || []),
              category: t.category || "home",
              trendScore: Math.min(100, Math.max(1, t.trendScore || 70)),
              scannedAt: new Date(),
            },
          })
        )
      );
    }

    let searchVolume: number | null = null;
    const targetMarket = result.targetMarket || "DE";
    const marketplace = targetMarket.toLowerCase() === "uk" ? "uk" : targetMarket.toLowerCase() === "fr" ? "fr" : "de";
    if (result.searchKeywords?.[0]) {
      try {
        const mcp = createSellerspriteMcpClient();
        const kwRes = await mcp.callToolSafe("keyword_research", {
          keyword: result.searchKeywords[0],
          marketplace,
        });
        if (kwRes.ok && kwRes.data) {
          const d = typeof kwRes.data === "string" ? JSON.parse(kwRes.data) : kwRes.data;
          searchVolume = d.monthlySearchVolume ?? d.searchVolume ?? null;
        }
      } catch { /* non-blocking */ }
    }

    const featureMd = (result.featureDetails || [])
      .map((f) => `### ${f.name}\n${f.description}`)
      .join("\n\n");

    const selectedTrend = trendItems[result.selectedTrendIndex] ?? trendItems[0];
    const idea = await prisma.europeProductIdea.create({
      data: {
        name: result.productName,
        category: result.category || selectedTrend?.category || "home",
        description: result.recommendation,
        targetMarket: targetMarket,
        keyFeatures: JSON.stringify(result.keyFeatures || []),
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

    await prisma.europeTopPickReport.update({
      where: { id: report.id },
      data: {
        ideaId: idea.id,
        productName: result.productName,
        productNameEn: result.productNameEn || "",
        executiveSummary: result.recommendation,
        estimatedRetailPrice: result.priceRange || null,
        estimatedCogs: result.estimatedCost || null,
        estimatedMargin: result.estimatedMargin || null,
        keyFeatures: featureMd || "",
        marketAnalysis: result.targetAudience
          ? `### 目标市场\n${targetMarket} 市场\n\n### 目标消费者\n${result.targetAudience}`
          : "",
        briefFeatures: (result.keyFeatures || []).join(", "),
        briefCompetition: result.competition || "medium",
        briefScore: result.score || 70,
        status: "completed",
        phase: "brief",
      },
    });

    await prisma.dailyEuropeReport
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

    const finalReport = await prisma.europeTopPickReport.findUnique({
      where: { id: report.id },
      include: { idea: { select: ideaSelect } },
    });

    console.info(`[europe-top-pick-brief] 完成: ${result.productName} (score: ${result.score})`);

    return NextResponse.json({ report: finalReport, ok: true });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    const errStack = e instanceof Error ? e.stack : undefined;
    console.error("[europe-top-pick-brief] 生成失败:", errMsg);
    if (errStack) console.error("[europe-top-pick-brief] Stack:", errStack);
    await prisma.europeTopPickReport.update({
      where: { id: report.id },
      data: { status: "failed" },
    });
    return NextResponse.json(
      { message: errMsg || "生成失败" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  // Return the latest non-dismissed completed report
  const report = await prisma.europeTopPickReport.findFirst({
    where: { dismissed: false, status: "completed" },
    orderBy: { createdAt: "desc" },
    include: { idea: { select: ideaSelect } },
  });

  return NextResponse.json({ report: report ?? null });
}

export async function PATCH(req: NextRequest) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = await req.json();
  const { id, action } = body as { id: string; action: string };

  if (action === "dismiss") {
    const rpt = await prisma.europeTopPickReport.findUnique({ where: { id } });
    if (!rpt) {
      return NextResponse.json({ message: "不存在" }, { status: 404 });
    }
    const idea = rpt.ideaId
      ? await prisma.europeProductIdea.findUnique({
          where: { id: rpt.ideaId },
          select: { category: true },
        })
      : null;

    await prisma.europeTopPickReport.update({
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
