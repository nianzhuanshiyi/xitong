import { parseAsinInput } from "@/lib/asin-parser";
import { prisma } from "@/lib/prisma";
import { claudeJson, claudeMessages } from "@/lib/claude-client";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";
import { generateFactorySpecMarkdown } from "@/lib/product-analysis/factory-spec";
import { buildAnalysisCacheKey } from "./cache-key";
import type { AnalysisResult, ScoreBand, StreamProgressEvent } from "./types";
import {
  collectSeries,
  extractNodeId,
  guessPriceFromDetail,
  truncateJson,
} from "./utils";

/** Extract nodeIdPath string (e.g. "3760911:11062741:...") from asin_detail data */
function extractNodeIdPath(obj: unknown, depth = 0): string | null {
  if (depth > 12 || obj == null || typeof obj !== "object") return null;
  if (Array.isArray(obj)) {
    for (const x of obj) {
      const n = extractNodeIdPath(x, depth + 1);
      if (n) return n;
    }
    return null;
  }
  const o = obj as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    if (/^nodeIdPath$/i.test(k) && typeof v === "string" && v.trim()) {
      return v.trim();
    }
  }
  for (const v of Object.values(o)) {
    const n = extractNodeIdPath(v, depth + 1);
    if (n) return n;
  }
  return null;
}

function bandFromTotal(total: number): ScoreBand {
  if (total >= 80) return "strong";
  if (total >= 60) return "moderate";
  if (total >= 40) return "careful";
  return "avoid";
}

function bandLabel(b: ScoreBand): string {
  const m: Record<ScoreBand, string> = {
    strong: "强烈推荐进入",
    moderate: "可以考虑",
    careful: "谨慎评估",
    avoid: "不建议进入",
  };
  return m[b];
}

function heuristicScore(ctx: {
  marginPct: number;
  toolErrors: number;
  lowPriceCount: number;
}): AnalysisResult["score"] {
  let marketSpace = 12;
  let competition = 12;
  let profit = 12;
  const differentiation = 12;
  let barrier = 12;

  if (ctx.marginPct >= 28) profit = 18;
  else if (ctx.marginPct >= 18) profit = 15;
  else if (ctx.marginPct >= 10) profit = 12;
  else profit = 6;

  if (ctx.toolErrors > 8) {
    marketSpace -= 3;
    competition -= 2;
  }
  if (ctx.lowPriceCount > 0) {
    profit -= 4;
    barrier -= 2;
  }

  const clamp = (n: number) => Math.max(0, Math.min(20, Math.round(n)));
  const dimensions = {
    marketSpace: clamp(marketSpace),
    competition: clamp(competition),
    profit: clamp(profit),
    differentiation: clamp(differentiation),
    barrier: clamp(barrier),
  };
  const total = Math.min(
    100,
    Object.values(dimensions).reduce((a, b) => a + b, 0)
  );
  const band = bandFromTotal(total);
  return {
    total,
    band,
    label: bandLabel(band),
    dimensions,
    rationale:
      "部分接口未返回数据时使用的启发式评分，建议配置卖家精灵 MCP 与 Claude 后重新分析以获得更准确结论。",
  };
}

export type ProductAnalysisRunMeta = {
  fromCache: boolean;
  cacheMeta?: {
    updatedAt: string;
    analystLabel: string;
  };
};

export async function runProductAnalysis(
  rawInput: string,
  profitInput: {
    purchaseCost: number;
    firstMile: number;
    fbaEstimate: number;
    referralPct: number;
    adPct: number;
    returnPct: number;
  },
  userId: string,
  onProgress: (e: StreamProgressEvent) => void,
  options?: { forceRefresh?: boolean }
): Promise<{ result: AnalysisResult; reportId: string | null } & ProductAnalysisRunMeta> {
  const p = (step: string, label: string, percent: number) =>
    onProgress({ type: "progress", step, label, percent });

  const parsed = parseAsinInput(rawInput);
  if (parsed.asins.length === 0) {
    throw new Error("未识别到有效 ASIN，请粘贴亚马逊链接或 10 位 ASIN（每行一个）");
  }

  const cacheKey = buildAnalysisCacheKey(parsed, profitInput);

  if (!options?.forceRefresh) {
    const hit = await prisma.analysisCache.findUnique({
      where: { cacheKey },
      include: {
        analyzedBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (hit && hit.expiresAt.getTime() > Date.now()) {
      let result: AnalysisResult;
      try {
        result = JSON.parse(hit.analysisData) as AnalysisResult;
      } catch {
        throw new Error("缓存数据损坏，请点击「重新分析」");
      }
      const analystLabel =
        hit.analyzedBy.name?.trim() ||
        hit.analyzedBy.email?.trim() ||
        "其他用户";
      p("cache", "已命中分析缓存", 100);
      return {
        result,
        reportId: null,
        fromCache: true,
        cacheMeta: {
          updatedAt: hit.updatedAt.toISOString(),
          analystLabel,
        },
      };
    }
  }

  p("parse", "解析 ASIN 与站点", 3);

  const mcp = createSellerspriteMcpClient();

  const byAsin: Record<string, unknown> = {};
  const detailErrors: Record<string, string> = {};
  const lowPriceWarnings: string[] = [];

  for (const asin of parsed.asins) {
    const r = await mcp.callToolSafe("asin_detail", {
      asin,
      marketplace: parsed.marketplace,
    });
    if (r.ok) {
      byAsin[asin] = r.data;
      const price = guessPriceFromDetail(r.data);
      if (price != null && price < 15) {
        lowPriceWarnings.push(
          `${asin} 当前展示价约 $${price.toFixed(2)}，低于 $15 门槛，标红预警：低价类目利润空间可能被压缩，不建议盲目进入。`
        );
      }
    } else {
      detailErrors[asin] = r.error;
    }
  }

  p("basics", "基础数据（asin_detail）", 18);

  const primary = parsed.asins[0];
  const [kw, src, lst] = await Promise.all([
    mcp.callToolSafe("traffic_keyword", {
      request: { asin: primary, marketplace: parsed.marketplace },
    }),
    mcp.callToolSafe("traffic_source", {
      request: { q: primary, marketplace: parsed.marketplace },
    }),
    mcp.callToolSafe("traffic_listing", {
      request: { asinList: [primary], marketplace: parsed.marketplace, relations: ["similar"] },
    }),
  ]);

  const trafficErrors: string[] = [];
  if (!kw.ok) trafficErrors.push(`traffic_keyword: ${kw.error}`);
  if (!src.ok) trafficErrors.push(`traffic_source: ${src.error}`);
  if (!lst.ok) trafficErrors.push(`traffic_listing: ${lst.error}`);

  p("traffic", "流量结构（关键词 / 来源 / Listing）", 32);

  const reviewByAsin: Record<string, unknown> = {};
  const reviewErrors: Record<string, string> = {};
  for (const asin of parsed.asins) {
    const r = await mcp.callToolSafe("review", {
      asin,
      marketplace: parsed.marketplace,
    });
    if (r.ok) reviewByAsin[asin] = r.data;
    else reviewErrors[asin] = r.error;
  }

  p("reviews", "评价与评论内容", 44);

  const nodeId =
    extractNodeId(byAsin[primary]) ??
    extractNodeId(kw.ok ? kw.data : null) ??
    null;

  const nodeIdPath =
    extractNodeIdPath(byAsin[primary]) ??
    (nodeId ? String(nodeId) : null);

  const marketRequest = {
    marketplace: parsed.marketplace,
    ...(nodeIdPath ? { nodeIdPath } : {}),
  };

  const [mr, mbc, msc, mldd, mpd] = await Promise.all([
    mcp.callToolSafe("market_research", { request: marketRequest }),
    mcp.callToolSafe("market_brand_concentration", { request: marketRequest }),
    mcp.callToolSafe("market_seller_concentration", { request: marketRequest }),
    mcp.callToolSafe("market_listing_date_distribution", { request: marketRequest }),
    mcp.callToolSafe("market_price_distribution", { request: marketRequest }),
  ]);

  const marketErrors: string[] = [];
  if (!mr.ok) marketErrors.push(`market_research: ${mr.error}`);
  if (!mbc.ok) marketErrors.push(`market_brand_concentration: ${mbc.error}`);
  if (!msc.ok) marketErrors.push(`market_seller_concentration: ${msc.error}`);
  if (!mldd.ok)
    marketErrors.push(`market_listing_date_distribution: ${mldd.error}`);
  if (!mpd.ok) marketErrors.push(`market_price_distribution: ${mpd.error}`);

  p("market", "市场竞争与价格带", 56);

  const [keepa, gTrend, pred] = await Promise.all([
    mcp.callToolSafe("keepa_info", {
      asin: primary,
      marketplace: parsed.marketplace,
    }),
    mcp.callToolSafe("google_trend", {
      asin: primary,
      marketplace: parsed.marketplace,
    }),
    mcp.callToolSafe("asin_prediction", {
      asin: primary,
      marketplace: parsed.marketplace,
    }),
  ]);

  const trendErrors: string[] = [];
  if (!keepa.ok) trendErrors.push(`keepa_info: ${keepa.error}`);
  if (!gTrend.ok) trendErrors.push(`google_trend: ${gTrend.error}`);
  if (!pred.ok) trendErrors.push(`asin_prediction: ${pred.error}`);

  const series = collectSeries(keepa.ok ? keepa.data : null);

  p("trends", "趋势与预测（Keepa / 谷歌趋势）", 64);

  const sellingPrice =
    guessPriceFromDetail(byAsin[primary]) ?? 29.99;
  const {
    purchaseCost,
    firstMile,
    fbaEstimate,
    referralPct,
    adPct,
    returnPct,
  } = profitInput;

  const referralFee = sellingPrice * referralPct;
  const adCost = sellingPrice * adPct;
  const returnCost = sellingPrice * returnPct;
  const netProfit =
    sellingPrice -
    purchaseCost -
    firstMile -
    fbaEstimate -
    referralFee -
    adCost -
    returnCost;
  const marginPct =
    sellingPrice > 0 ? (netProfit / sellingPrice) * 100 : 0;

  const scenarios = [
    { label: "当前价", sellingPrice, netProfit: 0, marginPct: 0 },
    {
      label: "降价 10%",
      sellingPrice: sellingPrice * 0.9,
      netProfit: 0,
      marginPct: 0,
    },
    {
      label: "提价 10%",
      sellingPrice: sellingPrice * 1.1,
      netProfit: 0,
      marginPct: 0,
    },
  ].map((row) => {
    const ref = row.sellingPrice * referralPct;
    const ad = row.sellingPrice * adPct;
    const ret = row.sellingPrice * returnPct;
    const net =
      row.sellingPrice -
      purchaseCost -
      firstMile -
      fbaEstimate -
      ref -
      ad -
      ret;
    const m = row.sellingPrice > 0 ? (net / row.sellingPrice) * 100 : 0;
    return { ...row, netProfit: net, marginPct: m };
  });

  const fixedOutOfPocket =
    purchaseCost + firstMile + fbaEstimate;
  const breakEvenHint =
    netProfit > 0 && marginPct > 0
      ? `粗略盈亏平衡：若仅考虑变动费率，需保证售价能覆盖 FBA+佣金+广告+退货假设；固定成本约 $${fixedOutOfPocket.toFixed(2)} / 件（采购+头程+FBA 估算）。`
      : "当前假设下净利润为负或接近零，需重新谈判采购价或提高售价。";

  p("profit", "利润测算", 72);

  const toolErrorCount =
    Object.keys(detailErrors).length +
    trafficErrors.length +
    Object.keys(reviewErrors).length +
    marketErrors.length +
    trendErrors.length;

  const contextForAi = {
    marketplace: parsed.marketplace,
    asins: parsed.asins,
    basics: truncateJson(byAsin),
    traffic: truncateJson({
      keyword: kw.ok ? kw.data : null,
      source: src.ok ? src.data : null,
      listing: lst.ok ? lst.data : null,
    }),
    reviews: truncateJson(reviewByAsin),
    market: truncateJson({
      research: mr.ok ? mr.data : null,
      brand: mbc.ok ? mbc.data : null,
      seller: msc.ok ? msc.data : null,
    }),
    profit: {
      sellingPrice,
      marginPct,
      assumptions: profitInput,
    },
  };

  p("claude_review", "Claude 评价洞察", 78);

  type PainJson = {
    painPoints?: Array<{ point: string; severity?: string; frequency?: string }>;
    differentiators?: string[];
    reviewSummary?: string;
  };

  const painJson = await claudeJson<PainJson>({
    system:
      "你是亚马逊选品分析师。只输出合法 JSON，不要 markdown。字段：painPoints[{point,severity,frequency}], differentiators[string], reviewSummary(string)。",
    user: `根据以下评价/MCP 数据摘要，提炼用户痛点 TOP5（可少于5）、差异化方向、简短评价总结。\n${truncateJson(reviewByAsin, 8000)}`,
  });

  p("claude_score", "Claude 综合评分", 86);

  type ScoreJson = {
    total?: number;
    dimensions?: {
      marketSpace?: number;
      competition?: number;
      profit?: number;
      differentiation?: number;
      barrier?: number;
    };
    rationale?: string;
  };

  const scoreJson = await claudeJson<ScoreJson>({
    system:
      "你是亚马逊选品决策助手。只输出 JSON：{total:0-100, dimensions:{marketSpace,competition,profit,differentiation,barrier 各0-20}, rationale:string}。",
    user: `结合数据摘要给出综合分与五维得分（每项最高20，总和约等于 total）。\n${truncateJson(contextForAi, 10000)}`,
  });

  let score: AnalysisResult["score"];
  if (
    scoreJson &&
    typeof scoreJson.total === "number" &&
    scoreJson.dimensions
  ) {
    const d = scoreJson.dimensions;
    const dimensions = {
      marketSpace: Math.min(20, Math.max(0, Number(d.marketSpace ?? 10))),
      competition: Math.min(20, Math.max(0, Number(d.competition ?? 10))),
      profit: Math.min(20, Math.max(0, Number(d.profit ?? 10))),
      differentiation: Math.min(
        20,
        Math.max(0, Number(d.differentiation ?? 10))
      ),
      barrier: Math.min(20, Math.max(0, Number(d.barrier ?? 10))),
    };
    const total = Math.min(100, Math.max(0, Math.round(scoreJson.total)));
    const band = bandFromTotal(total);
    score = {
      total,
      band,
      label: bandLabel(band),
      dimensions,
      rationale: scoreJson.rationale ?? "",
    };
  } else {
    score = heuristicScore({
      marginPct,
      toolErrors: toolErrorCount,
      lowPriceCount: lowPriceWarnings.length,
    });
  }

  p("claude_report", "生成完整报告", 93);

  const profitRequirement =
    "\n\n**利润分析章节要求：**必须严格使用数据摘要中 profit.assumptions 里用户提供的成本假设（purchaseCost=采购成本、firstMile=头程、fbaEstimate=FBA估算、referralPct=佣金比例、adPct=广告占比、returnPct=退货损耗占比）和 profit.sellingPrice（当前售价）来计算利润。使用表格展示：售价、采购成本、头程、FBA费、佣金、广告费、退货损耗、净利润、利润率。不要自行编造成本数据。同时展示降价10%和提价10%的利润敏感性分析。";

  const reportSystemHigh =
    "用中文撰写亚马逊选品分析报告，使用 Markdown。结构必须包含：## 竞品信息汇总（表格）、## 痛点分析、## 差异化创新建议、## 利润分析、## 工厂指示单（含产品描述、尺寸重量材质、必须改进点、包装、质量标准、目标成本、参考 ASIN、预计首批量）。语气专业简洁。" + profitRequirement;
  const reportSystemLow =
    "用中文撰写亚马逊选品分析报告，使用 Markdown。结构必须包含：## 竞品信息汇总（表格）、## 痛点分析、## 差异化创新建议、## 利润分析。不要写「工厂指示单」完整章节（读者将在页面底部按需单独生成）；语气专业简洁。" + profitRequirement;

  const profitSummary = `\n\n【用户利润假设 - 必须使用这些数据】\n售价: $${sellingPrice.toFixed(2)}\n采购成本: $${purchaseCost}\n头程: $${firstMile}\nFBA估算: $${fbaEstimate}\n佣金(${(referralPct * 100).toFixed(0)}%): $${referralFee.toFixed(2)}\n广告(${(adPct * 100).toFixed(0)}%): $${adCost.toFixed(2)}\n退货损耗(${(returnPct * 100).toFixed(0)}%): $${returnCost.toFixed(2)}\n净利润: $${netProfit.toFixed(2)}\n利润率: ${marginPct.toFixed(1)}%`;

  const reportMarkdown =
    (await claudeMessages({
      system: score.total >= 60 ? reportSystemHigh : reportSystemLow,
      user: `数据摘要：\n${truncateJson({ ...contextForAi, score }, 14000)}${profitSummary}`,
    })) ?? "# 报告生成失败\n请检查 Claude API Key 与模型额度。";

  let factorySpecMarkdown = "";
  if (score.total >= 60) {
    const auto = (
      await generateFactorySpecMarkdown({
        parsed,
        ai: {
          painPoints: painJson?.painPoints ?? [],
          reviewSummary: painJson?.reviewSummary ?? "",
          differentiators: painJson?.differentiators ?? [],
        },
      })
    ).trim();
    factorySpecMarkdown =
      auto ||
      "（自动生成失败，请点击报告底部「生成工厂指示单」重试。）";
  }

  const competitorTableMarkdown =
    `| ASIN | 说明 |\n| --- | --- |\n` +
    parsed.asins.map((a) => `| ${a} | 详见基础数据与 MCP 原始字段 |\n`).join("");

  const result: AnalysisResult = {
    parsed,
    basics: {
      byAsin,
      errors: detailErrors,
      lowPriceWarnings,
    },
    traffic: {
      keyword: kw.ok ? kw.data : null,
      source: src.ok ? src.data : null,
      listing: lst.ok ? lst.data : null,
      errors: trafficErrors,
    },
    reviews: { byAsin: reviewByAsin, errors: reviewErrors },
    market: {
      research: mr.ok ? mr.data : null,
      brandConc: mbc.ok ? mbc.data : null,
      sellerConc: msc.ok ? msc.data : null,
      listingDateDist: mldd.ok ? mldd.data : null,
      priceDist: mpd.ok ? mpd.data : null,
      errors: marketErrors,
    },
    profit: {
      assumptions: {
        sellingPrice,
        purchaseCost,
        firstMile,
        fbaEstimate,
        referralPct,
        adPct,
        returnPct,
      },
      breakdown: {
        referralFee,
        adCost,
        returnCost,
        netProfit,
        marginPct,
      },
      scenarios,
      breakEvenUnitsHint: breakEvenHint,
    },
    trends: {
      keepa: keepa.ok ? keepa.data : null,
      googleTrend: gTrend.ok ? gTrend.data : null,
      prediction: pred.ok ? pred.data : null,
      chartBsr: series.bsr,
      chartPrice: series.price,
      errors: trendErrors,
    },
    score,
    ai: {
      painPoints: painJson?.painPoints ?? [],
      reviewSummary: painJson?.reviewSummary ?? "",
      reportMarkdown,
      differentiators: painJson?.differentiators ?? [],
      factorySpecMarkdown,
      competitorTableMarkdown,
    },
  };

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90);

  await prisma.analysisCache.upsert({
    where: { cacheKey },
    create: {
      cacheKey,
      asin: parsed.asins[0] ?? "",
      marketplace: parsed.marketplace,
      analysisData: JSON.stringify(result),
      reportMarkdown: result.ai.reportMarkdown,
      score: score.total,
      analyzedById: userId,
      expiresAt,
    },
    update: {
      asin: parsed.asins[0] ?? "",
      marketplace: parsed.marketplace,
      analysisData: JSON.stringify(result),
      reportMarkdown: result.ai.reportMarkdown,
      score: score.total,
      analyzedById: userId,
      expiresAt,
    },
  });

  const report = await prisma.productAnalysisReport.create({
    data: {
      userId,
      marketplace: parsed.marketplace,
      asinsJson: JSON.stringify(parsed.asins),
      title: `选品分析 · ${parsed.asins.slice(0, 3).join(", ")}${parsed.asins.length > 3 ? "…" : ""}`,
      score: score.total,
      scoreBand: score.band,
      status: "completed",
      resultJson: JSON.stringify(result),
    },
  });

  await prisma.operationLog.create({
    data: {
      userId,
      action: "PRODUCT_ANALYSIS",
      resource: report.id,
      details: JSON.stringify({
        asins: parsed.asins,
        score: score.total,
        band: score.band,
      }),
    },
  });

  p("save", "已保存到历史记录", 100);

  return {
    result,
    reportId: report.id,
    fromCache: false,
  };
}
