import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { claudeJson } from "@/lib/claude-client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ── POST: Generate top pick report ──────────────────────────────
export async function POST() {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // Check existing
  const existing = await prisma.topPickReport.findUnique({
    where: { reportDate: today },
  });
  if (existing && existing.status === "completed") {
    return NextResponse.json({ report: existing, skipped: true });
  }

  // Get top 10 ideas by score
  const topIdeas = await prisma.productIdea.findMany({
    where: { status: "draft" },
    orderBy: { totalScore: "desc" },
    take: 10,
    include: { trend: true },
  });

  if (topIdeas.length === 0) {
    return NextResponse.json(
      { message: "没有可用的创意，请先扫描趋势并生成创意" },
      { status: 400 }
    );
  }

  // Create or update report
  const report = existing
    ? await prisma.topPickReport.update({
        where: { id: existing.id },
        data: { status: "generating" },
      })
    : await prisma.topPickReport.create({
        data: {
          reportDate: today,
          status: "generating",
          createdBy: session.user.id,
        },
      });

  try {
    // ── Step 1: AI selects the best idea ──
    const ideasForAI = topIdeas.map((idea) => ({
      id: idea.id,
      name: idea.name,
      category: idea.category,
      description: idea.description,
      targetMarket: idea.targetMarket,
      keyIngredients: JSON.parse(idea.keyIngredients),
      sellingPoints: JSON.parse(idea.sellingPoints),
      estimatedPrice: idea.estimatedPrice,
      estimatedCost: idea.estimatedCost,
      totalScore: idea.totalScore,
      trendScore: idea.trendScore,
      marketScore: idea.marketScore,
      competitionScore: idea.competitionScore,
      profitScore: idea.profitScore,
      recommendation: idea.recommendation,
      searchVolume: idea.searchVolume,
      competitionLevel: idea.competitionLevel,
      avgPrice: idea.avgPrice,
      trendTitle: idea.trend?.title ?? "",
      trendMarket: idea.trend?.market ?? "",
    }));

    const PICK_SYSTEM = `你是一位资深美妆产品总监，服务于一家亚马逊跨境美妆卖家。
我们的核心优势：
- 在美国、中国、韩国都有供应链资源（原料+代工）
- 主做美妆护肤品（护肤为主，彩妆为辅）
- 主要销售渠道：Amazon US + TikTok Shop US
- 团队擅长差异化定位和内容营销

你需要从给定的候选创意中，选出1个最值得投入开发的产品。

选择标准（按优先级排序）：
1. 趋势热度高且持续性好（不是短期炒作）
2. 竞争可进入（不是巨头垄断品类）
3. 利润空间好（毛利率≥60%为佳）
4. 我们的供应链能做（中韩美都有资源）
5. 差异化空间大（能做出不一样的产品）
6. 适合线上销售和内容营销

返回JSON：
{
  "selectedIdeaId": "选中的创意ID",
  "reason": "1-2句话说明为什么选这个（中文）"
}`;

    console.info("[top-pick] Step 1: AI 选择最佳创意...");
    const pickResult = await claudeJson<{
      selectedIdeaId: string;
      reason: string;
    }>({
      system: PICK_SYSTEM,
      user: `以下是评分最高的${topIdeas.length}个美妆新品创意，请从中选出1个最值得开发的产品。只返回JSON，不要包含其他文字。\n\n${JSON.stringify(ideasForAI, null, 2)}`,
      maxTokens: 1024,
    });

    if (!pickResult?.selectedIdeaId) {
      throw new Error("AI 未能选出产品");
    }

    const selectedIdea =
      topIdeas.find((i) => i.id === pickResult.selectedIdeaId) ?? topIdeas[0];

    console.info(`[top-pick] 选中: ${selectedIdea.name}`);

    // ── Step 2: Generate full plan ──
    const PLAN_SYSTEM = `你是一位资深美妆产品总监+亚马逊运营专家，正在为选定的新品编写一份完整的可落地执行方案。

公司背景：
- 亚马逊跨境美妆卖家，在美国、中国、韩国都有供应链
- 主要销售：Amazon US + TikTok Shop US
- 团队规模：小团队，追求效率和差异化

请为这个产品生成一份详尽的商业方案，所有内容必须具体、可执行、有数据支撑。

返回JSON对象（注意：Markdown字段用\\n换行）：
{
  "productName": "中文产品名",
  "productNameEn": "English Product Name",
  "executiveSummary": "1-2句话方案摘要，说清楚为什么选这个、预期回报",

  "productSpec": {
    "volume": "容量/规格",
    "packaging": "包装形式",
    "shelfLife": "保质期",
    "ingredientRatio": "主要成分配比建议",
    "certifications": ["需要的认证"],
    "fdaCompliance": "FDA合规说明"
  },
  "keyIngredients": "每个核心成分的Markdown详解（作用机理、安全性、来源、合规情况）",
  "formulaSuggestion": "配方建议Markdown（方向、注意事项、参考配方框架）",

  "marketAnalysis": "市场分析Markdown（目标人群画像、市场规模、增长趋势、消费者痛点）",
  "competitorAnalysis": "竞品分析Markdown（Top3竞品名称、价格、评分、月销量估算、主要差评痛点）",
  "differentiationStrategy": "差异化策略Markdown（我们怎么做得不一样、核心卖点提炼）",

  "estimatedRetailPrice": "$XX.XX",
  "estimatedCogs": "$X.XX",
  "estimatedFbaFee": "$X.XX",
  "estimatedAdCost": "$X.XX",
  "estimatedProfit": "$X.XX",
  "estimatedMargin": "XX%",
  "breakEvenUnits": 数字,

  "supplierPlan": "供应商对接方案Markdown（建议供应商类型、中国/韩国资源建议、MOQ预估、对接步骤）",
  "timelinePlan": [
    {"phase": "阶段名称", "duration": "时长", "detail": "详细说明"},
    ...
  ],
  "listingPlan": "Listing方案Markdown（标题关键词建议、五点描述方向、A+页面建议、主图风格）",
  "launchStrategy": "上架策略Markdown（定价策略、PPC广告策略、促销计划、社媒营销、红人合作建议）",
  "riskAssessment": "风险评估Markdown（可能风险及应对措施，至少列出5个风险点）"
}`;

    const ideaContext = {
      name: selectedIdea.name,
      category: selectedIdea.category,
      description: selectedIdea.description,
      targetMarket: selectedIdea.targetMarket,
      keyIngredients: JSON.parse(selectedIdea.keyIngredients),
      sellingPoints: JSON.parse(selectedIdea.sellingPoints),
      estimatedPrice: selectedIdea.estimatedPrice,
      estimatedCost: selectedIdea.estimatedCost,
      totalScore: selectedIdea.totalScore,
      searchVolume: selectedIdea.searchVolume,
      competitionLevel: selectedIdea.competitionLevel,
      avgPrice: selectedIdea.avgPrice,
      avgRating: selectedIdea.avgRating,
      trendTitle: selectedIdea.trend?.title ?? "",
      trendContent: selectedIdea.trend?.content ?? "",
      aiReason: pickResult.reason,
    };

    console.info("[top-pick] Step 2: 生成完整方案...");
    const plan = await claudeJson<Record<string, unknown>>({
      system: PLAN_SYSTEM,
      user: `请为以下产品生成完整的落地执行方案。只返回JSON对象，不要包含其他文字。\n\n产品信息：\n${JSON.stringify(ideaContext, null, 2)}`,
      maxTokens: 16384,
    });

    if (!plan) {
      throw new Error("AI 方案生成失败");
    }

    // Parse productSpec
    const productSpecStr =
      typeof plan.productSpec === "string"
        ? plan.productSpec
        : JSON.stringify(plan.productSpec ?? {});

    const timelinePlanStr =
      typeof plan.timelinePlan === "string"
        ? plan.timelinePlan
        : JSON.stringify(plan.timelinePlan ?? []);

    const s = (v: unknown) => (typeof v === "string" ? v : String(v ?? ""));
    const n = (v: unknown) =>
      typeof v === "number" ? v : parseInt(String(v ?? "0"), 10) || null;

    await prisma.topPickReport.update({
      where: { id: report.id },
      data: {
        ideaId: selectedIdea.id,
        productName: s(plan.productName) || selectedIdea.name,
        productNameEn: s(plan.productNameEn),
        executiveSummary: s(plan.executiveSummary) || pickResult.reason,
        productSpec: productSpecStr,
        keyIngredients: s(plan.keyIngredients),
        formulaSuggestion: s(plan.formulaSuggestion),
        marketAnalysis: s(plan.marketAnalysis),
        competitorAnalysis: s(plan.competitorAnalysis),
        differentiationStrategy: s(plan.differentiationStrategy),
        estimatedRetailPrice: s(plan.estimatedRetailPrice) || null,
        estimatedCogs: s(plan.estimatedCogs) || null,
        estimatedFbaFee: s(plan.estimatedFbaFee) || null,
        estimatedAdCost: s(plan.estimatedAdCost) || null,
        estimatedProfit: s(plan.estimatedProfit) || null,
        estimatedMargin: s(plan.estimatedMargin) || null,
        breakEvenUnits: n(plan.breakEvenUnits),
        supplierPlan: s(plan.supplierPlan),
        timelinePlan: timelinePlanStr,
        listingPlan: s(plan.listingPlan),
        launchStrategy: s(plan.launchStrategy),
        riskAssessment: s(plan.riskAssessment),
        status: "completed",
      },
    });

    const finalReport = await prisma.topPickReport.findUnique({
      where: { id: report.id },
    });

    console.info(`[top-pick] 完成: ${s(plan.productName)}`);

    return NextResponse.json({ report: finalReport, ok: true });
  } catch (e) {
    console.error("[top-pick]", e);
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
    orderBy: { createdAt: "desc" },
    include: {
      idea: {
        select: {
          id: true,
          totalScore: true,
          recommendation: true,
          trendScore: true,
          marketScore: true,
          competitionScore: true,
          profitScore: true,
        },
      },
    },
  });

  return NextResponse.json({ report: report ?? null });
}
