import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { claudeJson } from "@/lib/claude-client";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type DeepResult = {
  productSpec?: {
    dimensions?: string;
    weight?: string;
    material?: string;
    packaging?: string;
    certifications?: string;
    euCompliance?: string;
  };
  keyFeatures?: string;
  designSuggestion?: string;
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
  const report = await prisma.europeTopPickReport.findUnique({
    where: { id },
    include: {
      idea: {
        select: { id: true, keyFeatures: true, category: true },
      },
    },
  });

  if (!report) {
    return NextResponse.json({ message: "方案不存在" }, { status: 404 });
  }

  if (report.phase === "deep" && report.status === "completed") {
    const fullReport = await prisma.europeTopPickReport.findUnique({
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

  await prisma.europeTopPickReport.update({
    where: { id },
    data: { status: "generating", phase: "deep" },
  });

  try {
    console.info(`[europe-top-pick-deep] 开始深度分析: ${report.productName}`);

    const DEEP_SYSTEM_1 = `你是资深欧洲跨境电商分析师+亚马逊运营专家。
为以下欧洲蓝海产品生成详细分析（用中文，Markdown格式）：
- 产品：${report.productName}（${report.productNameEn}）
- 推荐理由：${report.executiveSummary}
- 核心功能：${report.briefFeatures}
- 竞争：${report.briefCompetition}
- 售价：${report.estimatedRetailPrice || "待定"}

注意：
- 中国供应链优势，产品轻小（<500g）适合FBA
- 欧洲市场合规要求（CE认证、REACH、WEEE等）
- 目标BSR 30-80蓝海区间
- 多语言Listing需求（德语/英语/法语等）

返回JSON：
{
  "productSpec": {"dimensions":"尺寸","weight":"重量","material":"材质","packaging":"包装","certifications":"CE/REACH等认证","euCompliance":"欧盟合规要求"},
  "keyFeatures": "## 核心功能\\n- **功能1**: 说明...\\n- **功能2**: 说明...",
  "designSuggestion": "## 设计建议\\n外观、结构、工艺建议（符合欧洲审美）...",
  "marketAnalysis": "## 市场分析\\n欧洲市场规模、趋势、客群...",
  "competitorAnalysis": "## 竞品分析\\n主要竞品、价格、评分...",
  "differentiationStrategy": "## 差异化\\n如何区别于欧洲本土品牌和其他中国卖家..."
}`;

    console.info("[europe-top-pick-deep] Call 1: 产品+市场分析...");
    const result1 = await claudeJson<{
      productSpec?: DeepResult["productSpec"];
      keyFeatures?: string;
      designSuggestion?: string;
      marketAnalysis?: string;
      competitorAnalysis?: string;
      differentiationStrategy?: string;
    }>({
      system: DEEP_SYSTEM_1,
      user: `为"${report.productName}"生成产品方案和欧洲市场分析。只返回JSON。`,
      maxTokens: 8192,
    });

    if (!result1) {
      console.error("[europe-top-pick-deep] Call 1 返回空");
      throw new Error("深度分析第一步失败：Claude API 返回空结果");
    }
    console.info("[europe-top-pick-deep] Call 1 完成");

    const DEEP_SYSTEM_2 = `你是资深欧洲跨境电商分析师+亚马逊运营专家。
为以下欧洲蓝海产品生成财务预估和执行方案（用中文，Markdown格式）：
- 产品：${report.productName}（${report.productNameEn}）
- 售价：${report.estimatedRetailPrice || "€18-25"}
- 成本：${report.estimatedCogs || "€4-6"}
- 利润率：${report.estimatedMargin || "65%"}

注意：
- 供应商以中国为主，产品轻小适合FBA
- 欧洲FBA费用结构（德国/英国仓为主）
- VAT税务考虑
- 多站点同步上架策略

返回JSON：
{
  "estimatedRetailPrice": "€XX.XX",
  "estimatedCogs": "€X.XX",
  "estimatedFbaFee": "€X.XX",
  "estimatedAdCost": "€X.XX",
  "estimatedProfit": "€X.XX",
  "estimatedMargin": "XX%",
  "breakEvenUnits": 数字,
  "supplierPlan": "## 供应商\\n中国供应商推荐...",
  "timelinePlan": [{"phase":"阶段","duration":"X周","detail":"内容"}],
  "listingPlan": "## Listing\\n多语言标题、图片（德语/英语/法语）...",
  "launchStrategy": "## 上架策略\\n欧洲多站点推广计划...",
  "riskAssessment": "## 风险\\n欧洲合规风险、VAT、竞争..."
}`;

    console.info("[europe-top-pick-deep] Call 2: 财务+执行方案...");
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
      user: `为"${report.productName}"生成欧洲市场财务预估和执行方案。只返回JSON。`,
      maxTokens: 8192,
    });

    if (!result2) {
      console.error("[europe-top-pick-deep] Call 2 返回空");
      throw new Error("深度分析第二步失败：Claude API 返回空结果");
    }
    console.info("[europe-top-pick-deep] Call 2 完成");

    const merged: DeepResult = { ...result1, ...result2 };

    const updated = await prisma.europeTopPickReport.update({
      where: { id },
      data: {
        productSpec: JSON.stringify(merged.productSpec || {}),
        keyFeatures: merged.keyFeatures || report.keyFeatures || "",
        designSuggestion: merged.designSuggestion || "",
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

    if (report.ideaId && merged.estimatedMargin) {
      const margin = parseFloat(merged.estimatedMargin) || 0;
      const profitScore = Math.round(Math.min(25, (margin / 100) * 25));
      await prisma.europeProductIdea.update({
        where: { id: report.ideaId },
        data: {
          estimatedPrice: merged.estimatedRetailPrice,
          profitScore,
          aiAnalysis: (merged.marketAnalysis || "").slice(0, 500),
        },
      }).catch(() => {});
    }

    console.info(`[europe-top-pick-deep] 完成: ${report.productName}`);
    return NextResponse.json({ report: updated, ok: true });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    const errStack = e instanceof Error ? e.stack : undefined;
    console.error("[europe-top-pick-deep] 深度分析失败:", errMsg);
    if (errStack) console.error("[europe-top-pick-deep] Stack:", errStack);
    await prisma.europeTopPickReport.update({
      where: { id },
      data: { status: "completed", phase: "brief" },
    });
    return NextResponse.json(
      { message: errMsg || "深度分析失败" },
      { status: 500 }
    );
  }
}
