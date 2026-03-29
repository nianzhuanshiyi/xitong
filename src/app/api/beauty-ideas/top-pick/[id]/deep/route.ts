import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { claudeJson } from "@/lib/claude-client";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/* ================================================================
   Phase 2 (Deep) — on-demand full business plan
   Only triggered when user clicks "深度分析"
   ================================================================ */

type DeepResult = {
  productSpec?: {
    volume?: string;
    packaging?: string;
    shelfLife?: string;
    ingredientRatio?: string;
    certifications?: string;
    fdaCompliance?: string;
  };
  keyIngredients?: string;
  formulaSuggestion?: string;
  marketAnalysis?: string;
  competitorAnalysis?: string;
  differentiationStrategy?: string;
  estimatedRetailPrice?: string;
  estimatedCogs?: string;
  estimatedFbaFee?: string;
  estimatedAdCost?: string;
  estimatedProfit?: string;
  estimatedMargin?: string;
  breakEvenUnits?: number;
  supplierPlan?: string;
  timelinePlan?: Array<{ phase: string; duration: string; detail: string }>;
  listingPlan?: string;
  launchStrategy?: string;
  riskAssessment?: string;
};

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const report = await prisma.topPickReport.findUnique({
    where: { id },
    include: {
      idea: {
        select: { id: true, keyIngredients: true, category: true },
      },
    },
  });

  if (!report) {
    return NextResponse.json({ message: "方案不存在" }, { status: 404 });
  }

  // Already deep?
  if (report.phase === "deep" && report.status === "completed") {
    const fullReport = await prisma.topPickReport.findUnique({
      where: { id },
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
    return NextResponse.json({ report: fullReport, skipped: true });
  }

  // Mark as generating
  await prisma.topPickReport.update({
    where: { id },
    data: { status: "generating", phase: "deep" },
  });

  try {
    console.info(`[top-pick-deep] 开始深度分析: ${report.productName}`);

    // Split deep analysis into 2 calls to avoid JSON truncation
    // Call 1: Product + Market analysis
    const DEEP_SYSTEM_1 = `你是资深美妆行业分析师+亚马逊运营专家。
为以下产品生成详细分析（用中文，Markdown格式）：
- 产品：${report.productName}（${report.productNameEn}）
- 推荐理由：${report.executiveSummary}
- 核心成分：${report.briefIngredients}
- 竞争：${report.briefCompetition}
- 售价：${report.estimatedRetailPrice || "待定"}

返回JSON：
{
  "productSpec": {"volume":"容量","packaging":"包装","shelfLife":"保质期","ingredientRatio":"配比","certifications":"认证","fdaCompliance":"FDA要点"},
  "keyIngredients": "## 核心成分\\n- **成分1**: 功效...\\n- **成分2**: 功效...",
  "formulaSuggestion": "## 配方建议\\n推荐配方...",
  "marketAnalysis": "## 市场分析\\n规模、趋势、客群...",
  "competitorAnalysis": "## 竞品分析\\n主要竞品、价格、评分...",
  "differentiationStrategy": "## 差异化\\n如何区别..."
}`;

    console.info("[top-pick-deep] Call 1: 产品+市场分析...");
    const result1 = await claudeJson<{
      productSpec?: DeepResult["productSpec"];
      keyIngredients?: string;
      formulaSuggestion?: string;
      marketAnalysis?: string;
      competitorAnalysis?: string;
      differentiationStrategy?: string;
    }>({
      system: DEEP_SYSTEM_1,
      user: `为"${report.productName}"生成产品方案和市场分析。只返回JSON。`,
      maxTokens: 8192,
    });

    if (!result1) {
      console.error("[top-pick-deep] ❌ Call 1 返回空（claudeJson 返回 null）");
      throw new Error("深度分析第一步失败：Claude API 返回空结果");
    }
    console.info("[top-pick-deep] Call 1 完成");

    // Call 2: Financial + Execution
    const DEEP_SYSTEM_2 = `你是资深美妆行业分析师+亚马逊运营专家。
为以下产品生成财务预估和执行方案（用中文，Markdown格式）：
- 产品：${report.productName}（${report.productNameEn}）
- 售价：${report.estimatedRetailPrice || "$18-25"}
- 成本：${report.estimatedCogs || "$4-6"}
- 利润率：${report.estimatedMargin || "65%"}

返回JSON：
{
  "estimatedRetailPrice": "$XX.XX",
  "estimatedCogs": "$X.XX",
  "estimatedFbaFee": "$X.XX",
  "estimatedAdCost": "$X.XX",
  "estimatedProfit": "$X.XX",
  "estimatedMargin": "XX%",
  "breakEvenUnits": 数字,
  "supplierPlan": "## 供应商\\n推荐供应商...",
  "timelinePlan": [{"phase":"阶段","duration":"X周","detail":"内容"}],
  "listingPlan": "## Listing\\n标题、图片...",
  "launchStrategy": "## 上架策略\\n推广计划...",
  "riskAssessment": "## 风险\\n主要风险..."
}`;

    console.info("[top-pick-deep] Call 2: 财务+执行方案...");
    const result2 = await claudeJson<{
      estimatedRetailPrice?: string;
      estimatedCogs?: string;
      estimatedFbaFee?: string;
      estimatedAdCost?: string;
      estimatedProfit?: string;
      estimatedMargin?: string;
      breakEvenUnits?: number;
      supplierPlan?: string;
      timelinePlan?: Array<{ phase: string; duration: string; detail: string }>;
      listingPlan?: string;
      launchStrategy?: string;
      riskAssessment?: string;
    }>({
      system: DEEP_SYSTEM_2,
      user: `为"${report.productName}"生成财务预估和执行方案。只返回JSON。`,
      maxTokens: 8192,
    });

    if (!result2) {
      console.error("[top-pick-deep] ❌ Call 2 返回空（claudeJson 返回 null）");
      throw new Error("深度分析第二步失败：Claude API 返回空结果");
    }
    console.info("[top-pick-deep] Call 2 完成");

    // Merge results
    const merged: DeepResult = { ...result1, ...result2 };

    // Update report with deep analysis
    const updated = await prisma.topPickReport.update({
      where: { id },
      data: {
        productSpec: JSON.stringify(merged.productSpec || {}),
        keyIngredients: merged.keyIngredients || report.keyIngredients || "",
        formulaSuggestion: merged.formulaSuggestion || "",
        marketAnalysis: merged.marketAnalysis || report.marketAnalysis || "",
        competitorAnalysis: merged.competitorAnalysis || "",
        differentiationStrategy: merged.differentiationStrategy || "",
        estimatedRetailPrice: merged.estimatedRetailPrice || report.estimatedRetailPrice,
        estimatedCogs: merged.estimatedCogs || report.estimatedCogs,
        estimatedFbaFee: merged.estimatedFbaFee || null,
        estimatedAdCost: merged.estimatedAdCost || null,
        estimatedProfit: merged.estimatedProfit || null,
        estimatedMargin: merged.estimatedMargin || report.estimatedMargin,
        breakEvenUnits: merged.breakEvenUnits || null,
        supplierPlan: merged.supplierPlan || "",
        timelinePlan: JSON.stringify(merged.timelinePlan || []),
        listingPlan: merged.listingPlan || "",
        launchStrategy: merged.launchStrategy || "",
        riskAssessment: merged.riskAssessment || "",
        status: "completed",
        phase: "deep",
      },
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

    // Update idea scores if available
    if (report.ideaId && merged.estimatedMargin) {
      const margin = parseFloat(merged.estimatedMargin) || 0;
      const profitScore = Math.round(Math.min(25, (margin / 100) * 25));
      await prisma.productIdea.update({
        where: { id: report.ideaId },
        data: {
          estimatedPrice: merged.estimatedRetailPrice,
          profitScore,
          aiAnalysis: (merged.marketAnalysis || "").slice(0, 500),
        },
      }).catch(() => {});
    }

    console.info(`[top-pick-deep] 完成: ${report.productName}`);
    return NextResponse.json({ report: updated, ok: true });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    const errStack = e instanceof Error ? e.stack : undefined;
    console.error("[top-pick-deep] ❌ 深度分析失败:", errMsg);
    if (errStack) console.error("[top-pick-deep] Stack:", errStack);
    // Restore to completed brief state (not failed) so the brief still shows
    await prisma.topPickReport.update({
      where: { id },
      data: { status: "completed", phase: "brief" },
    });
    return NextResponse.json(
      { message: errMsg || "深度分析失败" },
      { status: 500 }
    );
  }
}
