import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { claudeJson } from "@/lib/claude-client";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/* ================================================================
   3C新品创意生成 — 三步工作流
   1. Claude 生成 3C 品类关键词列表
   2. 卖家精灵 keyword_miner 筛选品类（搜索量/供需比/点击集中度）
   3. Claude 结合筛选结果生成 1 个最优新品方案（含竞品分析）
   ================================================================ */

function getBeijingDate(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

function deepNum(obj: unknown, key: string, depth = 0): number | null {
  if (depth > 8 || obj == null || typeof obj !== "object") return null;
  if (Array.isArray(obj)) {
    for (const x of obj) {
      const r = deepNum(x, key, depth + 1);
      if (r !== null) return r;
    }
    return null;
  }
  const o = obj as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    if (k.toLowerCase() === key.toLowerCase() && typeof v === "number") return v;
  }
  for (const v of Object.values(o)) {
    const r = deepNum(v, key, depth + 1);
    if (r !== null) return r;
  }
  return null;
}

type KeywordSuggestion = {
  keyword: string;
  keywordEn: string;
  category: string;
  rationale: string;
};

type KeywordScreenResult = {
  keyword: string;
  keywordEn: string;
  category: string;
  searches: number | null;
  products: number | null;
  sdr: number | null;          // supply-demand ratio = searches/products
  monopolyClickRate: number | null; // click concentration
  passed: boolean;
  failReasons: string[];
  rawData?: unknown;
};

type FinalPlanResult = {
  selectedKeyword: string;
  productName: string;
  productNameEn: string;
  executiveSummary: string;
  targetAudience: string;
  priceRange: string;
  estimatedCost: string;
  estimatedMargin: string;
  estimatedRetailPrice: string;
  estimatedCogs: number;
  estimatedFbaFee: number;
  estimatedAdCost: number;
  estimatedProfit: number;
  breakEvenUnits: number;
  competition: string;
  keyFeatures: Array<{ name: string; description: string }>;
  keyFeatureList: string[];
  designSuggestion: string;
  marketAnalysis: string;
  competitorAnalysis: string;
  differentiationStrategy: string;
  supplierPlan: string;
  timelinePlan: Array<{ phase: string; duration: string; detail: string }>;
  listingPlan: string;
  launchStrategy: string;
  riskAssessment: string;
  score: number;
  marketScore: number;
  competitionScore: number;
  trendScore: number;
  profitScore: number;
  recommendation: string;
  competitionLevel: string;
};

// ── POST: 生成新品方案 ──────────────────────────────────────────

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
    const { session, error } = await requireModuleAccess("three-c-ideas");
    if (error) return error;
    userId = session.user.id;
  }

  const today = getBeijingDate();

  // Collect past product names to avoid repeats
  const historyPlans = await prisma.threeCIdeaPlan.findMany({
    where: { status: "completed", createdBy: userId },
    select: { productName: true, selectedKeyword: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const pastProducts = historyPlans.map((p) => p.productName).filter(Boolean);
  const avoidHint = pastProducts.length > 0
    ? `\n\n重要：已推荐过以下产品，请选择完全不同的新方向：${pastProducts.slice(0, 15).join("、")}`
    : "";

  // Create plan record
  const plan = await prisma.threeCIdeaPlan.create({
    data: { reportDate: today, status: "generating", createdBy: userId },
  });

  try {
    // ── Step 1: Claude 生成 3C 关键词候选 ─────────────────────

    console.info("[three-c-generate] Step 1: 生成品类关键词...");

    const KEYWORD_SYSTEM = `你是资深 3C 电子产品行业分析师，专注于亚马逊跨境电商选品。
公司主做亚马逊美国站 3C 电子品类，具备国内供应链优势。

任务：生成 8-12 个值得研究的 3C 电子品类关键词（英文），用于卖家精灵关键词挖掘工具筛选。

选品方向：
- 电脑周边：扩展坞、机械键盘、人体工学鼠标、显示器支架
- 手机配件：氮化镓快充、磁吸移动电源、无线充电器、多功能手机壳
- 智能家居：智能插座、室内监控、自动感应灯、智能喂食器
- 影音娱乐：降噪耳机、便携蓝牙音箱、投影仪幕布、K歌麦克风
- 车载电子：车载充气泵、行车记录仪、车载蓝牙适配器
- 穿戴设备：智能手表表带、VR/AR 配件
- 办公用品：碎纸机、标签打印机、电动升降桌配件

筛选标准（你要选能通过以下条件的关键词）：
- 月搜索量 ≥ 10,000 (3C 市场通常搜索量较大)
- 供需比 ≥ 0.3
- 均价 $20–$80
- 点击集中度 ≤ 45%
- 购买率 ≥ 2%
- 搜索增长率 ≥ 0%（上升期）

排除红海：普通 USB 线、基础手机壳、普通充电头、大牌高度垄断类
${avoidHint}

返回 JSON 数组，每个元素：
{
  "keyword": "英文关键词（2-4个单词的长尾词）",
  "keywordEn": "同上",
  "category": "peripherals/charging/smarthome/audio/automotive/wearable/office",
  "rationale": "为什么选这个词（30字内）"
}`;

    const keywords = await claudeJson<KeywordSuggestion[]>({
      system: KEYWORD_SYSTEM,
      user: `今天是${today}，请生成 3C 电子品类关键词候选列表。只返回JSON数组。`,
      maxTokens: 2048,
    });

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      throw new Error("关键词生成失败：Claude API 返回空结果");
    }

    console.info(`[three-c-generate] Step 1 完成：${keywords.length} 个关键词`);

    // ── Step 2: 卖家精灵 keyword_miner 筛选 ────────────────────

    console.info("[three-c-generate] Step 2: 卖家精灵筛选品类...");

    const mcp = createSellerspriteMcpClient();
    const screenResults: KeywordScreenResult[] = [];

    for (const kw of keywords.slice(0, 10)) {
      try {
        const res = await mcp.callToolSafe("keyword_miner", {
          request: {
            keyword: kw.keyword,
            marketplace: "US",
            size: 1,
          },
        });

        if (!res.ok || !res.data) {
          console.warn(`[three-c-generate] keyword_miner failed for "${kw.keyword}":`, res.ok ? "no data" : res.error);
          screenResults.push({
            keyword: kw.keyword,
            keywordEn: kw.keywordEn,
            category: kw.category,
            searches: null,
            products: null,
            sdr: null,
            monopolyClickRate: null,
            passed: false,
            failReasons: ["卖家精灵数据获取失败"],
          });
          continue;
        }

        const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
        const searches = deepNum(data, "searches") ?? deepNum(data, "monthlySearchVolume") ?? deepNum(data, "searchVolume");
        const products = deepNum(data, "products") ?? deepNum(data, "productCount");
        const monopolyClickRate = deepNum(data, "monopolyClickRate");

        // Calculate supply-demand ratio
        const sdr = (searches !== null && products !== null && products > 0)
          ? searches / products
          : (deepNum(data, "spr") ?? null);

        // Apply filter criteria
        const failReasons: string[] = [];

        if (searches === null || searches < 5000) {
          failReasons.push(`月搜索量${searches !== null ? searches.toLocaleString() : "未知"} < 5,000`);
        }
        if (sdr !== null && sdr < 0.2) {
          failReasons.push(`供需比${sdr.toFixed(2)} < 0.2`);
        }
        if (monopolyClickRate !== null && monopolyClickRate > 0.5) {
          failReasons.push(`点击集中度${(monopolyClickRate * 100).toFixed(0)}% > 50%`);
        }

        screenResults.push({
          keyword: kw.keyword,
          keywordEn: kw.keywordEn,
          category: kw.category,
          searches,
          products,
          sdr,
          monopolyClickRate,
          passed: failReasons.length === 0,
          failReasons,
        });
      } catch (e) {
        console.warn(`[three-c-generate] keyword_miner error for "${kw.keyword}":`, e);
        screenResults.push({
          keyword: kw.keyword,
          keywordEn: kw.keywordEn,
          category: kw.category,
          searches: null,
          products: null,
          sdr: null,
          monopolyClickRate: null,
          passed: false,
          failReasons: ["数据获取异常"],
        });
      }
    }

    const qualifiedKeywords = screenResults
      .filter((r) => r.passed)
      .sort((a, b) => (b.searches ?? 0) - (a.searches ?? 0));

    // If no keywords passed strict filters, take top 3 by search volume
    const workingKeywords = qualifiedKeywords.length > 0
      ? qualifiedKeywords
      : screenResults
          .filter((r) => r.searches !== null && r.searches >= 2000)
          .sort((a, b) => (b.searches ?? 0) - (a.searches ?? 0))
          .slice(0, 3);

    console.info(`[three-c-generate] Step 2 完成：${qualifiedKeywords.length} 个通过筛选，使用 ${workingKeywords.length} 个`);

    // Save interim progress
    await prisma.threeCIdeaPlan.update({
      where: { id: plan.id },
      data: {
        keywordsData: JSON.stringify(screenResults),
        qualifiedKeywords: JSON.stringify(workingKeywords.map((k) => k.keyword)),
      },
    });

    // ── Step 3: Claude 生成新品方案 ────────────────────────────

    console.info("[three-c-generate] Step 3: AI 生成新品方案...");

    const keywordSummary = screenResults
      .map((r) => {
        const status = r.passed ? "✓通过" : `✗未通过(${r.failReasons.join(", ")})`;
        return `- ${r.keyword}：搜索量${r.searches?.toLocaleString() ?? "未知"}，供需比${r.sdr?.toFixed(2) ?? "未知"}，点击集中度${r.monopolyClickRate !== null ? (r.monopolyClickRate * 100).toFixed(0) + "%" : "未知"} → ${status}`;
      })
      .join("\n");

    // Get top competitor product data via product_research for the best keyword
    const bestKeyword = workingKeywords[0];
    let competitorProductsData: unknown[] = [];

    if (bestKeyword) {
      try {
        const prodRes = await mcp.callToolSafe("product_research", {
          request: {
            keyword: bestKeyword.keyword,
            marketplace: "US",
            minPrice: 20,
            maxPrice: 100,
            minMonthlySales: 200,
            size: 10,
          },
        });

        if (prodRes.ok && prodRes.data) {
          const prodData = typeof prodRes.data === "string" ? JSON.parse(prodRes.data) : prodRes.data;
          const items = Array.isArray(prodData)
            ? prodData
            : (prodData as Record<string, unknown>).items
            ?? (prodData as Record<string, unknown>).products
            ?? (prodData as Record<string, unknown>).data
            ?? [];

          if (Array.isArray(items)) {
            competitorProductsData = (items as Record<string, unknown>[])
              .filter((p) => {
                const price = deepNum(p, "price") ?? deepNum(p, "unitPrice");
                const sales = deepNum(p, "monthlySales") ?? deepNum(p, "salesVolume") ?? deepNum(p, "monthSales");
                const reviews = deepNum(p, "reviews") ?? deepNum(p, "reviewCount");
                return (price === null || (price >= 20 && price <= 100)) && (sales === null || sales >= 200) && (reviews === null || reviews <= 3000);
              })
              .slice(0, 8);
          }
        }
      } catch (e) {
        console.warn("[three-c-generate] product_research failed:", e);
      }
    }

    // Save competitor products
    await prisma.threeCIdeaPlan.update({
      where: { id: plan.id },
      data: { competitorProducts: JSON.stringify(competitorProductsData) },
    });

    const competitorSummary = competitorProductsData.length > 0
      ? `\n\n竞品数据：\n${JSON.stringify(competitorProductsData.slice(0, 5), null, 2)}`
      : "";

    const PLAN_SYSTEM = `你是资深 3C 电子行业分析师+亚马逊运营专家。
公司主做亚马逊美国站 3C 品类，具备中国供应链优势，专注于 $20-80 价位段的高品质电子产品。

选品标准：
- 月搜索量 ≥ 10,000
- 均价 $20–$80
- 点击集中度 ≤ 45%
- 搜索增长率 ≥ 0%（市场上升期）

基于上述数据，生成 1 个最优 3C 电子新品方案。

返回 JSON：
{
  "selectedKeyword": "所选关键词",
  "productName": "中文产品名（含核心卖点）",
  "productNameEn": "English Product Name",
  "executiveSummary": "3句话推荐理由：市场机会+我们优势+切入策略",
  "targetAudience": "目标消费者画像",
  "priceRange": "$XX-$XX",
  "estimatedCost": "$X-$X",
  "estimatedMargin": "XX%",
  "competition": "low/medium/high",
  "keyFeatures": [{"name": "功能名", "description": "说明"}, ...],
  "keyFeatureList": ["功能1","功能2","功能3","功能4"],
  "designSuggestion": "## 产品设计建议",
  "marketAnalysis": "## 市场分析",
  "competitorAnalysis": "## 竞品分析",
  "differentiationStrategy": "## 差异化策略",
  "supplierPlan": "## 供应商方案",
  "timelinePlan": [{"phase":"阶段","duration":"X周","detail":"内容"}],
  "listingPlan": "## Listing 策略",
  "launchStrategy": "## 上架策略",
  "riskAssessment": "## 风险评估",
  "estimatedRetailPrice": "$XX.XX",
  "estimatedCogs": 15,
  "estimatedFbaFee": 8,
  "estimatedAdCost": 10,
  "estimatedProfit": 12,
  "estimatedMargin": "25%",
  "breakEvenUnits": 500,
  "score": 1-100,
  "marketScore": 0-25,
  "competitionScore": 0-25,
  "trendScore": 0-25,
  "profitScore": 0-25,
  "recommendation": "strong_go/go/watch/pass",
  "competitionLevel": "low/medium/high/extreme"
}`;

    const userPrompt = `今天是${today}。

卖家精灵品类筛选结果：
${keywordSummary}

通过筛选的关键词：${workingKeywords.map((k) => `${k.keyword}（月搜${k.searches?.toLocaleString() ?? "?"}）`).join("、") || "无"}${competitorSummary}

请基于以上数据，选择最有潜力的 3C 方向，生成1个最优新品方案。只返回JSON对象。`;

    const planResult = await claudeJson<FinalPlanResult>({
      system: PLAN_SYSTEM,
      user: userPrompt,
      maxTokens: 8192,
    });

    if (!planResult || !planResult.productName) {
      throw new Error("新品方案生成失败：Claude API 返回空结果");
    }

    const featureMd = (planResult.keyFeatures || [])
      .map((f) => `### ${f.name}\n${f.description}`)
      .join("\n\n");

    const bestKw = workingKeywords.find((k) => k.keyword === planResult.selectedKeyword)
      ?? workingKeywords[0];

    const updatedPlan = await prisma.threeCIdeaPlan.update({
      where: { id: plan.id },
      data: {
        selectedKeyword: planResult.selectedKeyword || bestKw?.keyword || "",
        searchVolume: bestKw?.searches ?? null,
        supplyDemandRatio: bestKw?.sdr ?? null,
        clickConcentration: bestKw?.monopolyClickRate ?? null,

        productName: planResult.productName,
        productNameEn: planResult.productNameEn || "",
        executiveSummary: planResult.executiveSummary || "",

        keyFeatures: featureMd || "",
        designSuggestion: planResult.designSuggestion || "",
        marketAnalysis: planResult.marketAnalysis || "",
        competitorAnalysis: planResult.competitorAnalysis || "",
        differentiationStrategy: planResult.differentiationStrategy || "",

        estimatedRetailPrice: planResult.estimatedRetailPrice || planResult.priceRange || null,
        estimatedCogs: planResult.estimatedCogs || null,
        estimatedFbaFee: planResult.estimatedFbaFee || null,
        estimatedAdCost: planResult.estimatedAdCost || null,
        estimatedProfit: planResult.estimatedProfit || null,
        estimatedMargin: planResult.estimatedMargin || null,
        breakEvenUnits: planResult.breakEvenUnits || null,

        supplierPlan: planResult.supplierPlan || "",
        timelinePlan: JSON.stringify(planResult.timelinePlan || []),
        listingPlan: planResult.listingPlan || "",
        launchStrategy: planResult.launchStrategy || "",
        riskAssessment: planResult.riskAssessment || "",

        totalScore: planResult.score || 70,
        marketScore: planResult.marketScore || 0,
        competitionScore: planResult.competitionScore || 0,
        trendScore: planResult.trendScore || 0,
        profitScore: planResult.profitScore || 0,
        recommendation: planResult.recommendation || "watch",
        competitionLevel: planResult.competitionLevel || "medium",

        status: "completed",
      },
    });

    // Activity log
    await prisma.activityLog.create({
      data: {
        userId,
        module: "three-c-ideas",
        action: "generate",
        detail: JSON.stringify({
          planId: plan.id,
          productName: planResult.productName,
          keyword: planResult.selectedKeyword,
          score: planResult.score,
        }),
      },
    }).catch(() => {});

    return NextResponse.json({ plan: updatedPlan, ok: true });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("[three-c-generate] 失败:", errMsg);
    await prisma.threeCIdeaPlan.update({
      where: { id: plan.id },
      data: { status: "failed" },
    }).catch(() => {});
    return NextResponse.json({ message: errMsg || "生成失败" }, { status: 500 });
  }
}

export async function GET() {
  const { session, error } = await requireModuleAccess("three-c-ideas");
  if (error) return error;
  const userId = session.user.id;

  const plan = await prisma.threeCIdeaPlan.findFirst({
    where: { createdBy: userId, dismissed: false, status: "completed" },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ plan: plan ?? null });
}
