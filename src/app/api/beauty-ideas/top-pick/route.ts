import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { claudeJson } from "@/lib/claude-client";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/* ================================================================
   Streamlined 3-step flow:
   1. Claude scans Top 5 trends → BeautyTrend
   2. Claude picks 1 best product + generates full plan → TopPickReport
   3. (Optional) Sellersprite validates market data → update report
   ================================================================ */

// ── Types ───────────────────────────────────────────────────────

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

type FullPlan = {
  selectedTrendIndex: number;
  productName: string;
  productNameEn: string;
  executiveSummary: string;
  category: string;
  targetMarket: string;
  searchKeywords: string[];
  productSpec: Record<string, unknown>;
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

// ── POST: Full pipeline ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Support both auth modes: session (browser) or secret header (cron)
  const secret = req.headers.get("x-auto-sync-secret");
  const isCron =
    secret === (process.env.AUTO_SYNC_SECRET || "__internal__");

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

  // Already completed today?
  const existing = await prisma.topPickReport.findUnique({
    where: { reportDate: today },
  });
  if (existing && existing.status === "completed") {
    return NextResponse.json({ report: existing, skipped: true });
  }

  // Create / reset report record
  const report = existing
    ? await prisma.topPickReport.update({
        where: { id: existing.id },
        data: { status: "generating" },
      })
    : await prisma.topPickReport.create({
        data: { reportDate: today, status: "generating", createdBy: userId },
      });

  try {
    // ═══════════════════════════════════════════════════════════
    // STEP 1: Scan Top 5 trends (1 Claude call)
    // ═══════════════════════════════════════════════════════════
    console.info("[top-pick] Step 1: 扫描 Top 5 趋势...");

    const SCAN_SYSTEM = `你是一位资深美妆行业分析师，服务于一家亚马逊跨境美妆卖家。
我们在美国、中国、韩国都有供应链资源，产品主要在亚马逊和TikTok Shop线上销售。

扫描当前最值得关注的美妆趋势，只挑选最有商业潜力的 Top 5。

筛选标准（严格）：
- 必须适合亚马逊线上销售（方便运输、不易损坏）
- 必须有差异化空间（不是已饱和品类）
- 必须有合理利润空间（零售价$15+，毛利率≥50%）
- 优先关注：新成分/新技术、社媒爆款趋势、FDA合规的新方向

覆盖市场：美国（重点）、韩国、中国

返回JSON数组（恰好5条），每条包含：
{
  "source": "social_media" | "industry_report" | "google_trends" | "news",
  "market": "US" | "KR" | "CN",
  "title": "趋势标题",
  "content": "趋势详细描述（100-150字，说清楚趋势是什么、为什么值得关注）",
  "ingredients": ["相关成分1", "成分2"],
  "category": "skincare" | "makeup" | "haircare" | "bodycare" | "fragrance",
  "trendScore": 70-100的热度分数（只给高分趋势）,
  "sourceUrl": null
}`;

    const trends = await claudeJson<TrendItem[]>({
      system: SCAN_SYSTEM,
      user: `今天是${today}，请扫描美妆市场趋势，严格挑选最有商业潜力的 Top 5。只返回JSON数组。`,
      maxTokens: 4096,
    });

    if (!trends || !Array.isArray(trends) || trends.length === 0) {
      throw new Error("趋势扫描返回为空");
    }

    // Save trends
    const createdTrends = await prisma.$transaction(
      trends.slice(0, 5).map((t) =>
        prisma.beautyTrend.create({
          data: {
            source: t.source || "social_media",
            market: t.market || "US",
            title: t.title,
            content: t.content,
            ingredients: JSON.stringify(t.ingredients || []),
            category: t.category || "skincare",
            trendScore: Math.min(100, Math.max(1, t.trendScore || 70)),
            sourceUrl: t.sourceUrl || null,
            scannedAt: new Date(),
          },
        })
      )
    );

    console.info(`[top-pick] Step 1 完成: ${createdTrends.length} 条趋势`);

    // ═══════════════════════════════════════════════════════════
    // STEP 2: Pick 1 product + full plan (1 Claude call)
    // ═══════════════════════════════════════════════════════════
    console.info("[top-pick] Step 2: 精选产品 + 生成方案...");

    const trendsForAI = createdTrends.map((t, i) => ({
      index: i,
      title: t.title,
      content: t.content,
      market: t.market,
      ingredients: t.ingredients,
      category: t.category,
      trendScore: t.trendScore,
    }));

    const PLAN_SYSTEM = `你是一位资深美妆产品总监+亚马逊运营专家。

公司背景：
- 亚马逊跨境美妆卖家，美国、中国、韩国都有供应链（原料+代工）
- 主要销售渠道：Amazon US + TikTok Shop US
- 小团队，追求效率和差异化，一次只做一个产品

任务：从给定的5个趋势中，选出1个最适合我们做的方向，并生成完整的可落地执行方案。

选择标准（按优先级）：
1. 趋势热度高且持续性好（不是短期炒作）
2. 竞争可进入（不是大品牌垄断）
3. 毛利率≥60%（零售价$18-35区间最佳）
4. 我们的中韩美供应链能做
5. 差异化空间大、适合内容营销

返回一个JSON对象（所有Markdown字段用\\n换行）：
{
  "selectedTrendIndex": 0-4的数字（选中的趋势序号）,
  "productName": "中文产品名",
  "productNameEn": "English Product Name",
  "executiveSummary": "2-3句话：选了什么、为什么选、预期回报",
  "category": "skincare/makeup/haircare/bodycare/fragrance",
  "targetMarket": "US",
  "searchKeywords": ["amazon搜索关键词1", "关键词2", "关键词3"],

  "productSpec": {
    "volume": "容量/规格",
    "packaging": "包装形式",
    "shelfLife": "保质期",
    "ingredientRatio": "主要成分配比建议",
    "certifications": ["需要的认证"],
    "fdaCompliance": "FDA合规说明"
  },
  "keyIngredients": "Markdown：每个核心成分的作用、安全性、来源",
  "formulaSuggestion": "Markdown：配方方向、注意事项",

  "marketAnalysis": "Markdown：目标人群、市场规模、增长趋势",
  "competitorAnalysis": "Markdown：Top3竞品名称、价格、评分、主要差评痛点",
  "differentiationStrategy": "Markdown：我们怎么做得不一样",

  "estimatedRetailPrice": "$XX.XX",
  "estimatedCogs": "$X.XX（含原料+包装+人工）",
  "estimatedFbaFee": "$X.XX",
  "estimatedAdCost": "$X.XX/单",
  "estimatedProfit": "$X.XX/单",
  "estimatedMargin": "XX%",
  "breakEvenUnits": 数字（月销量盈亏平衡点）,

  "supplierPlan": "Markdown：建议供应商类型、中韩资源建议、MOQ、对接步骤",
  "timelinePlan": [
    {"phase": "阶段名", "duration": "时长", "detail": "说明"},
    ...6-8个阶段
  ],
  "listingPlan": "Markdown：标题关键词、五点描述、A+页面、主图风格",
  "launchStrategy": "Markdown：定价策略、PPC广告、促销计划、红人合作",
  "riskAssessment": "Markdown：5个以上风险点及应对措施"
}`;

    const plan = await claudeJson<FullPlan>({
      system: PLAN_SYSTEM,
      user: `以下是今日Top 5美妆趋势，请选出1个最适合我们做的方向，并生成完整方案。只返回JSON对象。\n\n${JSON.stringify(trendsForAI, null, 2)}`,
      maxTokens: 16384,
    });

    if (!plan || !plan.productName) {
      throw new Error("方案生成失败");
    }

    console.info(`[top-pick] Step 2 完成: ${plan.productName}`);

    // Link to selected trend
    const selectedTrendIdx = plan.selectedTrendIndex ?? 0;
    const selectedTrend = createdTrends[selectedTrendIdx] ?? createdTrends[0];

    // Also create a single ProductIdea for the selected product (for relations)
    const idea = await prisma.productIdea.create({
      data: {
        trendId: selectedTrend.id,
        name: plan.productName,
        category: plan.category || selectedTrend.category,
        description: plan.executiveSummary,
        targetMarket: plan.targetMarket || "US",
        keyIngredients: JSON.stringify(plan.searchKeywords || []),
        sellingPoints: JSON.stringify([]),
        estimatedPrice: plan.estimatedRetailPrice,
        estimatedCost: plan.estimatedCogs,
        totalScore: selectedTrend.trendScore,
        trendScore: Math.round((selectedTrend.trendScore / 100) * 25),
        recommendation: selectedTrend.trendScore >= 80 ? "go" : "watch",
        aiAnalysis: plan.executiveSummary,
        status: "validated",
        createdBy: userId,
      },
    });

    // ═══════════════════════════════════════════════════════════
    // STEP 3: Sellersprite validation (optional, non-blocking)
    // ═══════════════════════════════════════════════════════════
    let mcpNote = "";
    if (plan.searchKeywords?.[0]) {
      console.info("[top-pick] Step 3: 卖家精灵验证...");
      try {
        const mcp = createSellerspriteMcpClient();
        const kwRes = await mcp.callToolSafe("keyword_research", {
          keyword: plan.searchKeywords[0],
          marketplace: "us",
        });
        if (kwRes.ok && kwRes.data) {
          const kwData =
            typeof kwRes.data === "string"
              ? JSON.parse(kwRes.data)
              : kwRes.data;
          const vol = kwData.monthlySearchVolume ?? kwData.searchVolume;
          if (vol) {
            mcpNote = `\n\n---\n### 卖家精灵验证数据\n- 关键词：${plan.searchKeywords[0]}\n- 月搜索量：${Number(vol).toLocaleString()}\n`;

            // Update idea with real data
            await prisma.productIdea.update({
              where: { id: idea.id },
              data: {
                searchVolume: typeof vol === "number" ? vol : parseInt(String(vol), 10) || null,
                marketData: JSON.stringify(kwData),
              },
            });
          }
        }

        // Try product research too
        const prRes = await mcp.callToolSafe("product_research", {
          keyword: plan.searchKeywords[0],
          marketplace: "us",
        });
        if (prRes.ok && prRes.data) {
          const prData =
            typeof prRes.data === "string"
              ? JSON.parse(prRes.data)
              : prRes.data;
          const items = prData.items ?? prData.products ?? [];
          if (items.length > 0) {
            const prices = items
              .map((i: { price?: number }) => i.price)
              .filter(Boolean) as number[];
            const reviews = items.map(
              (i: { reviews?: number; ratingsCount?: number }) =>
                i.reviews ?? i.ratingsCount ?? 0
            );
            const avgPrice =
              prices.length > 0
                ? (
                    prices.reduce((a: number, b: number) => a + b, 0) /
                    prices.length
                  ).toFixed(2)
                : "N/A";
            const avgReviews =
              reviews.length > 0
                ? Math.round(
                    reviews.reduce((a: number, b: number) => a + b, 0) /
                      reviews.length
                  )
                : "N/A";
            mcpNote += `- 竞品均价：$${avgPrice}\n- 竞品平均评论数：${avgReviews}\n- 前页竞品数：${items.length}\n`;
          }
        }
        console.info("[top-pick] Step 3 完成");
      } catch (e) {
        console.warn("[top-pick] 卖家精灵验证跳过:", e instanceof Error ? e.message : e);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // Save final report
    // ═══════════════════════════════════════════════════════════
    const s = (v: unknown) => (typeof v === "string" ? v : String(v ?? ""));

    await prisma.topPickReport.update({
      where: { id: report.id },
      data: {
        ideaId: idea.id,
        productName: plan.productName,
        productNameEn: s(plan.productNameEn),
        executiveSummary: plan.executiveSummary,
        productSpec:
          typeof plan.productSpec === "string"
            ? plan.productSpec
            : JSON.stringify(plan.productSpec ?? {}),
        keyIngredients: s(plan.keyIngredients),
        formulaSuggestion: s(plan.formulaSuggestion),
        marketAnalysis: s(plan.marketAnalysis) + mcpNote,
        competitorAnalysis: s(plan.competitorAnalysis),
        differentiationStrategy: s(plan.differentiationStrategy),
        estimatedRetailPrice: s(plan.estimatedRetailPrice) || null,
        estimatedCogs: s(plan.estimatedCogs) || null,
        estimatedFbaFee: s(plan.estimatedFbaFee) || null,
        estimatedAdCost: s(plan.estimatedAdCost) || null,
        estimatedProfit: s(plan.estimatedProfit) || null,
        estimatedMargin: s(plan.estimatedMargin) || null,
        breakEvenUnits:
          typeof plan.breakEvenUnits === "number"
            ? plan.breakEvenUnits
            : parseInt(String(plan.breakEvenUnits ?? "0"), 10) || null,
        supplierPlan: s(plan.supplierPlan),
        timelinePlan:
          typeof plan.timelinePlan === "string"
            ? plan.timelinePlan
            : JSON.stringify(plan.timelinePlan ?? []),
        listingPlan: s(plan.listingPlan),
        launchStrategy: s(plan.launchStrategy),
        riskAssessment: s(plan.riskAssessment),
        status: "completed",
      },
    });

    // Also update daily report if exists
    await prisma.dailyBeautyReport
      .upsert({
        where: { reportDate: today },
        create: {
          reportDate: today,
          trendsFound: createdTrends.length,
          ideasGenerated: 1,
          highScoreIdeas: 1,
          trendsSummary: createdTrends
            .map((t) => `- **${t.title}** (${t.market}, 热度${t.trendScore})`)
            .join("\n"),
          ideasSummary: `精选产品：**${plan.productName}**\n${plan.executiveSummary}`,
          status: "completed",
        },
        update: {
          trendsFound: createdTrends.length,
          ideasGenerated: 1,
          highScoreIdeas: 1,
          trendsSummary: createdTrends
            .map((t) => `- **${t.title}** (${t.market}, 热度${t.trendScore})`)
            .join("\n"),
          ideasSummary: `精选产品：**${plan.productName}**\n${plan.executiveSummary}`,
          status: "completed",
        },
      })
      .catch(() => {});

    const finalReport = await prisma.topPickReport.findUnique({
      where: { id: report.id },
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
            searchVolume: true,
          },
        },
      },
    });

    console.info(`[top-pick] 全部完成: ${plan.productName}`);

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
          searchVolume: true,
        },
      },
    },
  });

  return NextResponse.json({ report: report ?? null });
}
