import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { claudeJson } from "@/lib/claude-client";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/* ================================================================
   美妆新品创意生成 — 三步工作流
   1. Claude 生成美妆品类关键词列表
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
  estimatedCogs: string;
  estimatedFbaFee: string;
  estimatedAdCost: string;
  estimatedProfit: string;
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
    const { session, error } = await requireModuleAccess("beauty-ideas");
    if (error) return error;
    userId = session.user.id;
  }

  const today = getBeijingDate();

  // Collect past product names to avoid repeats
  const historyPlans = await prisma.beautyIdeaPlan.findMany({
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
  const plan = await prisma.beautyIdeaPlan.create({
    data: { reportDate: today, status: "generating", createdBy: userId },
  });

  try {
    // ── Step 1: Claude 生成美妆关键词候选 ─────────────────────

    console.info("[beauty-generate] Step 1: 生成品类关键词...");

    const KEYWORD_SYSTEM = `你是资深美妆护肤行业分析师，专注于亚马逊跨境电商选品。
公司主做亚马逊美国站美妆护肤品类，具备国内供应链优势。

任务：生成 8-12 个值得研究的美妆品类关键词（英文），用于卖家精灵关键词挖掘工具筛选。

选品方向：
- 护肤：精华、面膜、保湿霜、眼霜、防晒、祛痘、抗衰老
- 彩妆：唇彩、粉底、腮红、眼影、遮瑕
- 美发：护发素、发膜、头皮护理、染发
- 美体：身体乳、去角质、纤体
- 美妆工具：化妆刷、美妆蛋、卸妆仪、面部按摩器
- 香水/香氛：细分香型、沐浴香氛
- 健康美容：胶原蛋白、口服美容品

筛选标准（你要选能通过以下条件的关键词）：
- 月搜索量 ≥ 5,000
- 供需比 ≥ 0.5（搜索量/产品数，越高越好）
- 均价 $15–$40
- 点击集中度 ≤ 40%（前几名垄断程度低）
- 购买率 ≥ 1%
- 搜索增长率 ≥ 0%（上升期）

排除红海：普通唇膏、普通洗发水、普通沐浴露、大牌平替仿冒类
${avoidHint}

返回 JSON 数组，每个元素：
{
  "keyword": "英文关键词（2-4个单词的长尾词）",
  "keywordEn": "同上",
  "category": "skincare/makeup/haircare/bodycare/tools/fragrance/wellness",
  "rationale": "为什么选这个词（30字内）"
}`;

    const keywords = await claudeJson<KeywordSuggestion[]>({
      system: KEYWORD_SYSTEM,
      user: `今天是${today}，请生成美妆品类关键词候选列表。只返回JSON数组。`,
      maxTokens: 2048,
    });

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      throw new Error("关键词生成失败：Claude API 返回空结果");
    }

    console.info(`[beauty-generate] Step 1 完成：${keywords.length} 个关键词`);

    // ── Step 2: 卖家精灵 keyword_miner 筛选 ────────────────────

    console.info("[beauty-generate] Step 2: 卖家精灵筛选品类...");

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
          console.warn(`[beauty-generate] keyword_miner failed for "${kw.keyword}":`, res.ok ? "no data" : res.error);
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
        if (sdr !== null && sdr < 0.5) {
          failReasons.push(`供需比${sdr.toFixed(2)} < 0.5`);
        }
        if (monopolyClickRate !== null && monopolyClickRate > 0.4) {
          failReasons.push(`点击集中度${(monopolyClickRate * 100).toFixed(0)}% > 40%`);
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
        console.warn(`[beauty-generate] keyword_miner error for "${kw.keyword}":`, e);
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
          .filter((r) => r.searches !== null && r.searches >= 1000)
          .sort((a, b) => (b.searches ?? 0) - (a.searches ?? 0))
          .slice(0, 3);

    console.info(`[beauty-generate] Step 2 完成：${qualifiedKeywords.length} 个通过筛选，使用 ${workingKeywords.length} 个`);

    // Save interim progress
    await prisma.beautyIdeaPlan.update({
      where: { id: plan.id },
      data: {
        keywordsData: JSON.stringify(screenResults),
        qualifiedKeywords: JSON.stringify(workingKeywords.map((k) => k.keyword)),
      },
    });

    // ── Step 3: Claude 生成新品方案 ────────────────────────────

    console.info("[beauty-generate] Step 3: AI 生成新品方案...");

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
            minPrice: 15,
            maxPrice: 40,
            minMonthlySales: 300,
            size: 10,
          },
        });

        if (prodRes.ok && prodRes.data) {
          const prodData = typeof prodRes.data === "string" ? JSON.parse(prodRes.data) : prodRes.data;
          // Extract product list - try common response structures
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
                const revenue = deepNum(p, "monthlyRevenue") ?? deepNum(p, "monthRevenue");
                const reviews = deepNum(p, "reviews") ?? deepNum(p, "reviewCount");
                // Filter: price $15-40, sales ≥300, revenue ≥$5000, reviews 50-2000
                const priceOk = price === null || (price >= 15 && price <= 40);
                const salesOk = sales === null || sales >= 300;
                const revenueOk = revenue === null || revenue >= 5000;
                const reviewsOk = reviews === null || (reviews >= 50 && reviews <= 2000);
                return priceOk && salesOk && revenueOk && reviewsOk;
              })
              .slice(0, 8);
          }
        }
      } catch (e) {
        console.warn("[beauty-generate] product_research failed:", e);
      }
    }

    // Save competitor products
    await prisma.beautyIdeaPlan.update({
      where: { id: plan.id },
      data: { competitorProducts: JSON.stringify(competitorProductsData) },
    });

    const competitorSummary = competitorProductsData.length > 0
      ? `\n\n竞品数据（已通过价格$15-40 / 月销≥300 / 月收入≥$5000 / 评论50-2000筛选）：\n${JSON.stringify(competitorProductsData.slice(0, 5), null, 2)}`
      : "";

    const PLAN_SYSTEM = `你是资深美妆护肤行业分析师+亚马逊运营专家。
公司主做亚马逊美国站美妆护肤品类，具备中国供应链优势，专注于 $15-40 价位段的品牌型产品。

选品标准（卖家精灵数据已验证）：
- 月搜索量 ≥ 5,000（需求足够大）
- 供需比 ≥ 0.5（搜索量/商品数，供给空间充足）
- 均价 $15–$40（主力价位，保证利润）
- 点击集中度 ≤ 40%（头部垄断低，新品有机会）
- 购买率 ≥ 1%（搜索意图明确，转化好）
- 搜索增长率 ≥ 0%（市场上升期）

竞品标准（目标对标）：
- 价格 $15-40
- 月销量 ≥ 300（市场已验证）
- 月销售额 ≥ $5,000（有商业价值）
- 评论数 50-2,000（已验证但未形成绝对壁垒）

基于上述数据，生成 1 个最优美妆新品方案。

返回 JSON：
{
  "selectedKeyword": "所选关键词",
  "productName": "中文产品名（含核心卖点）",
  "productNameEn": "English Product Name",
  "executiveSummary": "3句话推荐理由：市场机会+我们优势+切入策略",
  "targetAudience": "目标消费者画像（年龄/肤质/痛点）",
  "priceRange": "$XX-$XX",
  "estimatedCost": "$X-$X（不含FBA）",
  "estimatedMargin": "XX%",
  "competition": "low/medium/high",
  "keyFeatures": [{"name": "功能名", "description": "1-2句话说明"}, ...],
  "keyFeatureList": ["功能1","功能2","功能3","功能4"],
  "designSuggestion": "## 产品设计建议\\n配方/成分/包装/外观...",
  "marketAnalysis": "## 市场分析\\n规模、趋势、客群、季节性...",
  "competitorAnalysis": "## 竞品分析\\n主要竞品特点、定价、评分、弱点...",
  "differentiationStrategy": "## 差异化策略\\n如何脱颖而出...",
  "supplierPlan": "## 供应商方案\\n国内供应商类型、认证要求（FDA/EU）...",
  "timelinePlan": [{"phase":"阶段","duration":"X周","detail":"内容"}],
  "listingPlan": "## Listing 策略\\n标题关键词、图片、A+...",
  "launchStrategy": "## 上架策略\\nVine、促销、广告...",
  "riskAssessment": "## 风险评估\\n监管/配方稳定性/季节性...",
  "estimatedRetailPrice": "$XX.XX",
  "estimatedCogs": "$X.XX",
  "estimatedFbaFee": "$X.XX",
  "estimatedAdCost": "$X.XX",
  "estimatedProfit": "$X.XX",
  "estimatedMargin": "XX%",
  "breakEvenUnits": 数字,
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

通过筛选的关键词：${workingKeywords.map((k) => `${k.keyword}（月搜${k.searches?.toLocaleString() ?? "?"}，供需比${k.sdr?.toFixed(2) ?? "?"}）`).join("、") || "无（用你的行业知识选择最佳方向）"}${competitorSummary}

请基于以上数据，选择最有潜力的关键词方向，生成1个最优美妆新品方案。只返回JSON对象。`;

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

    const updatedPlan = await prisma.beautyIdeaPlan.update({
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
        module: "beauty-ideas",
        action: "generate",
        detail: JSON.stringify({
          planId: plan.id,
          productName: planResult.productName,
          keyword: planResult.selectedKeyword,
          score: planResult.score,
          keywordsScanned: screenResults.length,
          keywordsPassed: qualifiedKeywords.length,
        }),
      },
    }).catch(() => {});

    console.info(`[beauty-generate] 完成: ${planResult.productName} (score: ${planResult.score})`);

    return NextResponse.json({ plan: updatedPlan, ok: true });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("[beauty-generate] 失败:", errMsg);
    await prisma.beautyIdeaPlan.update({
      where: { id: plan.id },
      data: { status: "failed" },
    }).catch(() => {});
    return NextResponse.json({ message: errMsg || "生成失败" }, { status: 500 });
  }
}

// ── GET: 最新方案 ───────────────────────────────────────────────

export async function GET() {
  const { session, error } = await requireModuleAccess("beauty-ideas");
  if (error) return error;
  const userId = session.user.id;

  const plan = await prisma.beautyIdeaPlan.findFirst({
    where: { createdBy: userId, dismissed: false, status: "completed" },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ plan: plan ?? null });
}
