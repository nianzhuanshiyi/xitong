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
  productSpec: {
    volume: string;
    packaging: string;
    shelfLife: string;
    ingredientRatio: string;
    certifications: string;
    fdaCompliance: string;
  };
  keyIngredients: string;
  formulaSuggestion: string;
  marketAnalysis: string;
  competitorAnalysis: string;
  differentiationStrategy: string;
  estimatedRetailPrice: string;
  estimatedCogs: string;
  estimatedFbaFee: string;
  estimatedAdCost: string;
  estimatedProfit: string;
  estimatedMargin: string;
  breakEvenUnits: number;
  supplierPlan: string;
  timelinePlan: Array<{ phase: string; duration: string; detail: string }>;
  listingPlan: string;
  launchStrategy: string;
  riskAssessment: string;
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
    return NextResponse.json({ report, skipped: true });
  }

  // Mark as generating
  await prisma.topPickReport.update({
    where: { id },
    data: { status: "generating", phase: "deep" },
  });

  try {
    console.info(`[top-pick-deep] 开始深度分析: ${report.productName}`);

    const DEEP_SYSTEM = `你是一位资深美妆行业分析师+产品总监+亚马逊运营专家，服务于跨境美妆卖家。
公司在美国、中国、韩国都有供应链，主做亚马逊和TikTok Shop线上销售。

你需要为以下产品方向生成完整的商业计划：
- 产品名称：${report.productName}（${report.productNameEn}）
- 简要推荐：${report.executiveSummary}
- 核心成分：${report.briefIngredients}
- 竞争程度：${report.briefCompetition}
- 信心评分：${report.briefScore}/100
- 预估售价：${report.estimatedRetailPrice || "待定"}

请生成详细的落地方案，返回JSON对象（所有Markdown字段使用中文，用##/###/- 等Markdown格式）：
{
  "productSpec": {
    "volume": "容量规格",
    "packaging": "包装形式",
    "shelfLife": "保质期",
    "ingredientRatio": "关键成分配比",
    "certifications": "所需认证",
    "fdaCompliance": "FDA合规要点"
  },
  "keyIngredients": "## 核心成分详解\\n每个成分的功效、用量、来源...(Markdown)",
  "formulaSuggestion": "## 配方建议\\n推荐配方、替代方案...(Markdown)",
  "marketAnalysis": "## 市场分析\\n市场规模、增长趋势、目标客群...(Markdown)",
  "competitorAnalysis": "## 竞品分析\\n主要竞品、价格带、评分...(Markdown)",
  "differentiationStrategy": "## 差异化策略\\n如何区别于竞品...(Markdown)",
  "estimatedRetailPrice": "$XX.XX",
  "estimatedCogs": "$X.XX",
  "estimatedFbaFee": "$X.XX",
  "estimatedAdCost": "$X.XX",
  "estimatedProfit": "$X.XX",
  "estimatedMargin": "XX%",
  "breakEvenUnits": 数字,
  "supplierPlan": "## 供应商方案\\n推荐供应商类型、对接策略...(Markdown)",
  "timelinePlan": [
    {"phase":"阶段名","duration":"X周","detail":"具体内容"},
    ...共4-6个阶段
  ],
  "listingPlan": "## Listing方案\\n标题、要点、图片策略...(Markdown)",
  "launchStrategy": "## 上架策略\\n推广计划、广告策略...(Markdown)",
  "riskAssessment": "## 风险评估\\n主要风险、应对措施...(Markdown)"
}`;

    const result = await claudeJson<DeepResult>({
      system: DEEP_SYSTEM,
      user: `请为"${report.productName}"生成完整商业计划。只返回JSON对象。`,
      maxTokens: 16384,
    });

    if (!result || !result.keyIngredients) {
      throw new Error("深度分析生成失败");
    }

    // Update report with deep analysis
    const updated = await prisma.topPickReport.update({
      where: { id },
      data: {
        productSpec: JSON.stringify(result.productSpec || {}),
        keyIngredients: result.keyIngredients,
        formulaSuggestion: result.formulaSuggestion || "",
        marketAnalysis: result.marketAnalysis || "",
        competitorAnalysis: result.competitorAnalysis || "",
        differentiationStrategy: result.differentiationStrategy || "",
        estimatedRetailPrice: result.estimatedRetailPrice || report.estimatedRetailPrice,
        estimatedCogs: result.estimatedCogs || null,
        estimatedFbaFee: result.estimatedFbaFee || null,
        estimatedAdCost: result.estimatedAdCost || null,
        estimatedProfit: result.estimatedProfit || null,
        estimatedMargin: result.estimatedMargin || report.estimatedMargin,
        breakEvenUnits: result.breakEvenUnits || null,
        supplierPlan: result.supplierPlan || "",
        timelinePlan: JSON.stringify(result.timelinePlan || []),
        listingPlan: result.listingPlan || "",
        launchStrategy: result.launchStrategy || "",
        riskAssessment: result.riskAssessment || "",
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
    if (report.ideaId) {
      const margin = parseFloat(result.estimatedMargin) || 0;
      const profitScore = Math.round(Math.min(25, (margin / 100) * 25));
      await prisma.productIdea.update({
        where: { id: report.ideaId },
        data: {
          estimatedPrice: result.estimatedRetailPrice,
          profitScore,
          aiAnalysis: result.marketAnalysis?.slice(0, 500) || "",
        },
      }).catch(() => {});
    }

    console.info(`[top-pick-deep] 完成: ${report.productName}`);
    return NextResponse.json({ report: updated, ok: true });
  } catch (e) {
    console.error("[top-pick-deep]", e);
    await prisma.topPickReport.update({
      where: { id },
      data: { status: "failed", phase: "brief" },
    });
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "深度分析失败" },
      { status: 500 }
    );
  }
}
