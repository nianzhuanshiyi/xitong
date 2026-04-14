import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { claudeJson } from "@/lib/claude-client";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/* ================================================================
   欧洲蓝海选品生成 — 三步工作流
   1. Claude 生成欧洲蓝海品类关键词列表（面向 DE/FR/UK 站）
   2. 卖家精灵 keyword_miner 筛选品类（搜索量/供需比/点击集中度）
   3. Claude 结合筛选结果生成 1 个最优新品方案（含竞品分析、欧盟合规建议）
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
  sdr: number | null;
  monopolyClickRate: number | null;
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
  targetMarket: string;
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
  regulatoryNotes: string;
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
    const { session, error } = await requireModuleAccess("europe-ideas");
    if (error) return error;
    userId = session.user.id;
  }

  // 从请求体获取目标市场，默认 DE
  let marketplace = "DE";
  try {
    const body = await req.json().catch(() => ({}));
    if (body.marketplace && ["DE", "FR", "UK", "IT", "ES"].includes(body.marketplace)) {
      marketplace = body.marketplace;
    }
  } catch { /* ignore */ }

  const today = getBeijingDate();

  // 收集历史产品名避免重复
  const historyPlans = await prisma.europeIdeaPlan.findMany({
    where: { status: "completed", createdBy: userId },
    select: { productName: true, selectedKeyword: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const pastProducts = historyPlans.map((p) => p.productName).filter(Boolean);
  const avoidHint = pastProducts.length > 0
    ? `\n\n重要：已推荐过以下产品，请选择完全不同的新方向：${pastProducts.slice(0, 15).join("、")}`
    : "";

  const marketplaceNames: Record<string, string> = {
    DE: "德国",
    FR: "法国",
    UK: "英国",
    IT: "意大利",
    ES: "西班牙",
  };
  const marketplaceName = marketplaceNames[marketplace] ?? marketplace;

  // 创建方案记录
  const plan = await prisma.europeIdeaPlan.create({
    data: {
      reportDate: today,
      status: "generating",
      createdBy: userId,
      marketplace,
    },
  });

  try {
    // ── Step 1: Claude 生成欧洲蓝海关键词候选 ─────────────────────

    console.info("[europe-generate] Step 1: 生成欧洲品类关键词...");

    const KEYWORD_SYSTEM = `你是资深跨境电商选品分析师，专注于亚马逊欧洲站蓝海选品。
公司具备国内供应链优势，目标是在亚马逊${marketplaceName}站（${marketplace}）找到低竞争、高需求的蓝海品类。

任务：生成 8-12 个值得研究的欧洲蓝海品类关键词（英文），用于卖家精灵关键词挖掘工具筛选。

欧洲蓝海选品方向（侧重欧洲本土需求和消费习惯）：
- 家居生活：收纳、厨房用具、浴室配件、环保家居
- 户外运动：露营、徒步、自行车配件、花园工具
- 宠物用品：狗猫用品、小动物用品
- 母婴儿童：安全玩具、教育类、婴儿护理
- 健康护理：按摩器、医疗辅助、健身小件
- 汽车配件：车内收纳、清洁工具
- 文具办公：北欧风格文具、桌面整理
- 工具五金：小型工具、DIY工具
- 电子配件：手机配件、电脑周边、智能家居
- 环保/可持续：竹制品、可降解用品

欧洲市场筛选标准（能通过以下条件）：
- 月搜索量 ≥ 3,000（欧洲站体量相对美国站小）
- 供需比 ≥ 0.4（搜索量/产品数）
- 均价 €15–€50（主力价位）
- 点击集中度 ≤ 45%（头部垄断低）
- 购买率 ≥ 0.8%
- 搜索增长率 ≥ 0%（上升期或稳定期）

排除红海：普通手机壳、普通充电线、普通T恤、大牌仿冒类
${avoidHint}

返回 JSON 数组，每个元素：
{
  "keyword": "英文关键词（2-4个单词的长尾词）",
  "keywordEn": "同上",
  "category": "home/outdoor/pet/baby/health/auto/stationery/tools/electronics/eco",
  "rationale": "为什么适合欧洲市场（30字内）"
}`;

    const keywords = await claudeJson<KeywordSuggestion[]>({
      system: KEYWORD_SYSTEM,
      user: `今天是${today}，目标市场是亚马逊${marketplaceName}站（${marketplace}）。请生成欧洲蓝海品类关键词候选列表。只返回JSON数组。`,
      maxTokens: 2048,
    });

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      throw new Error("关键词生成失败：Claude API 返回空结果");
    }

    console.info(`[europe-generate] Step 1 完成：${keywords.length} 个关键词`);

    // ── Step 2: 卖家精灵 keyword_miner 筛选 ────────────────────

    console.info("[europe-generate] Step 2: 卖家精灵筛选品类...");

    const mcp = createSellerspriteMcpClient();
    const screenResults: KeywordScreenResult[] = [];

    for (const kw of keywords.slice(0, 10)) {
      try {
        const res = await mcp.callToolSafe("keyword_miner", {
          request: {
            keyword: kw.keyword,
            marketplace,
            size: 1,
          },
        });

        if (!res.ok || !res.data) {
          console.warn(`[europe-generate] keyword_miner failed for "${kw.keyword}":`, res.ok ? "no data" : res.error);
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

        const sdr = (searches !== null && products !== null && products > 0)
          ? searches / products
          : (deepNum(data, "spr") ?? null);

        const failReasons: string[] = [];

        if (searches === null || searches < 3000) {
          failReasons.push(`月搜索量${searches !== null ? searches.toLocaleString() : "未知"} < 3,000`);
        }
        if (sdr !== null && sdr < 0.4) {
          failReasons.push(`供需比${sdr.toFixed(2)} < 0.4`);
        }
        if (monopolyClickRate !== null && monopolyClickRate > 0.45) {
          failReasons.push(`点击集中度${(monopolyClickRate * 100).toFixed(0)}% > 45%`);
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
        console.warn(`[europe-generate] keyword_miner error for "${kw.keyword}":`, e);
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

    const workingKeywords = qualifiedKeywords.length > 0
      ? qualifiedKeywords
      : screenResults
          .filter((r) => r.searches !== null && r.searches >= 500)
          .sort((a, b) => (b.searches ?? 0) - (a.searches ?? 0))
          .slice(0, 3);

    console.info(`[europe-generate] Step 2 完成：${qualifiedKeywords.length} 个通过筛选，使用 ${workingKeywords.length} 个`);

    await prisma.europeIdeaPlan.update({
      where: { id: plan.id },
      data: {
        keywordsData: JSON.stringify(screenResults),
        qualifiedKeywords: JSON.stringify(workingKeywords.map((k) => k.keyword)),
      },
    });

    // ── Step 3: Claude 生成新品方案 ────────────────────────────

    console.info("[europe-generate] Step 3: AI 生成新品方案...");

    const keywordSummary = screenResults
      .map((r) => {
        const status = r.passed ? "✓通过" : `✗未通过(${r.failReasons.join(", ")})`;
        return `- ${r.keyword}：搜索量${r.searches?.toLocaleString() ?? "未知"}，供需比${r.sdr?.toFixed(2) ?? "未知"}，点击集中度${r.monopolyClickRate !== null ? (r.monopolyClickRate * 100).toFixed(0) + "%" : "未知"} → ${status}`;
      })
      .join("\n");

    const bestKeyword = workingKeywords[0];
    let competitorProductsData: unknown[] = [];

    if (bestKeyword) {
      try {
        const prodRes = await mcp.callToolSafe("product_research", {
          request: {
            keyword: bestKeyword.keyword,
            marketplace,
            minPrice: 15,
            maxPrice: 50,
            minMonthlySales: 100,
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
                const revenue = deepNum(p, "monthlyRevenue") ?? deepNum(p, "monthRevenue");
                const reviews = deepNum(p, "reviews") ?? deepNum(p, "reviewCount");
                const priceOk = price === null || (price >= 15 && price <= 50);
                const salesOk = sales === null || sales >= 100;
                const revenueOk = revenue === null || revenue >= 2000;
                const reviewsOk = reviews === null || (reviews >= 20 && reviews <= 3000);
                return priceOk && salesOk && revenueOk && reviewsOk;
              })
              .slice(0, 8);
          }
        }
      } catch (e) {
        console.warn("[europe-generate] product_research failed:", e);
      }
    }

    await prisma.europeIdeaPlan.update({
      where: { id: plan.id },
      data: { competitorProducts: JSON.stringify(competitorProductsData) },
    });

    const competitorSummary = competitorProductsData.length > 0
      ? `\n\n竞品数据（已通过价格€15-50 / 月销≥100 / 月收入≥€2,000 / 评论20-3,000筛选）：\n${JSON.stringify(competitorProductsData.slice(0, 5), null, 2)}`
      : "";

    const PLAN_SYSTEM = `你是资深跨境电商选品分析师+亚马逊欧洲站运营专家。
公司具备中国供应链优势，目标是在亚马逊${marketplaceName}站（${marketplace}）找到蓝海机会，专注于 €15-50 价位段的差异化产品。

欧洲市场特点：
- 消费者重视产品质量、环保理念、设计美感
- 欧盟合规要求严格（CE认证、RoHS、REACH、电池法规等）
- 物流时效要求高，FBA本地仓优势明显
- 语言本地化（德文/法文/英文listing）

选品标准（卖家精灵数据已验证）：
- 月搜索量 ≥ 3,000（欧洲站体量）
- 供需比 ≥ 0.4（搜索量/商品数，供给空间充足）
- 均价 €15–€50（主力价位）
- 点击集中度 ≤ 45%（头部垄断低，新品有机会）
- 购买率 ≥ 0.8%
- 搜索增长率 ≥ 0%

竞品标准：
- 价格 €15-50
- 月销量 ≥ 100
- 月销售额 ≥ €2,000
- 评论数 20-3,000

基于以上数据，生成 1 个最优欧洲蓝海新品方案。

返回 JSON：
{
  "selectedKeyword": "所选关键词",
  "productName": "中文产品名（含核心卖点）",
  "productNameEn": "English Product Name",
  "executiveSummary": "3句话推荐理由：欧洲市场机会+我们优势+切入策略",
  "targetAudience": "目标消费者画像（年龄/需求/购买动机）",
  "targetMarket": "主攻市场说明（如：德国为主，兼顾法国/意大利）",
  "priceRange": "€XX-€XX",
  "estimatedCost": "€X-€X（不含FBA）",
  "estimatedMargin": "XX%",
  "competition": "low/medium/high",
  "keyFeatures": [{"name": "功能名", "description": "1-2句话说明"}, ...],
  "keyFeatureList": ["功能1","功能2","功能3","功能4"],
  "designSuggestion": "## 产品设计建议\\n外观风格/包装/材质/欧洲审美偏好...",
  "marketAnalysis": "## 欧洲市场分析\\n规模、趋势、各国差异、消费习惯...",
  "competitorAnalysis": "## 竞品分析\\n主要竞品特点、定价、评分、弱点...",
  "differentiationStrategy": "## 差异化策略\\n如何在欧洲市场脱颖而出...",
  "regulatoryNotes": "## 欧盟合规要求\\nCE认证、RoHS、REACH、EPR电子产品回收、电池法规、VAT等...",
  "supplierPlan": "## 供应商方案\\n国内供应商类型、欧盟认证要求、质检标准...",
  "timelinePlan": [{"phase":"阶段","duration":"X周","detail":"内容"}],
  "listingPlan": "## Listing 策略\\n多语言标题、关键词布局、A+内容...",
  "launchStrategy": "## 上架策略\\nVine计划、优惠券、广告投放...",
  "riskAssessment": "## 风险评估\\n合规风险/竞争风险/汇率/物流/季节性...",
  "estimatedRetailPrice": "€XX.XX",
  "estimatedCogs": "€X.XX",
  "estimatedFbaFee": "€X.XX",
  "estimatedAdCost": "€X.XX",
  "estimatedProfit": "€X.XX",
  "breakEvenUnits": 数字,
  "score": 1-100,
  "marketScore": 0-25,
  "competitionScore": 0-25,
  "trendScore": 0-25,
  "profitScore": 0-25,
  "recommendation": "strong_go/go/watch/pass",
  "competitionLevel": "low/medium/high/extreme"
}`;

    const userPrompt = `今天是${today}，目标市场：亚马逊${marketplaceName}站（${marketplace}）。

卖家精灵品类筛选结果：
${keywordSummary}

通过筛选的关键词：${workingKeywords.map((k) => `${k.keyword}（月搜${k.searches?.toLocaleString() ?? "?"}，供需比${k.sdr?.toFixed(2) ?? "?"}）`).join("、") || "无（用你的行业知识选择最佳欧洲蓝海方向）"}${competitorSummary}

请基于以上数据，选择最有潜力的关键词方向，生成1个最优欧洲蓝海新品方案。只返回JSON对象。`;

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

    const updatedPlan = await prisma.europeIdeaPlan.update({
      where: { id: plan.id },
      data: {
        selectedKeyword: planResult.selectedKeyword || bestKw?.keyword || "",
        searchVolume: bestKw?.searches ?? null,
        supplyDemandRatio: bestKw?.sdr ?? null,
        clickConcentration: bestKw?.monopolyClickRate ?? null,

        productName: planResult.productName,
        productNameEn: planResult.productNameEn || "",
        executiveSummary: planResult.executiveSummary || "",
        targetMarket: planResult.targetMarket || marketplaceName,
        regulatoryNotes: planResult.regulatoryNotes || "",

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

    await prisma.activityLog.create({
      data: {
        userId,
        module: "europe-ideas",
        action: "generate",
        detail: JSON.stringify({
          planId: plan.id,
          productName: planResult.productName,
          keyword: planResult.selectedKeyword,
          score: planResult.score,
          marketplace,
          keywordsScanned: screenResults.length,
          keywordsPassed: qualifiedKeywords.length,
        }),
      },
    }).catch(() => {});

    console.info(`[europe-generate] 完成: ${planResult.productName} (score: ${planResult.score})`);

    return NextResponse.json({ plan: updatedPlan, ok: true });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("[europe-generate] 失败:", errMsg);
    await prisma.europeIdeaPlan.update({
      where: { id: plan.id },
      data: { status: "failed" },
    }).catch(() => {});
    return NextResponse.json({ message: errMsg || "生成失败" }, { status: 500 });
  }
}

// ── GET: 最新方案 ───────────────────────────────────────────────

export async function GET() {
  const { session, error } = await requireModuleAccess("europe-ideas");
  if (error) return error;
  const userId = session.user.id;

  const plan = await prisma.europeIdeaPlan.findFirst({
    where: { createdBy: userId, dismissed: false, status: "completed" },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ plan: plan ?? null });
}
