/**
 * Etsy 产品 AI 分析工具
 *
 * 分析 Etsy 产品的卖点、差异化、定价策略、目标客群、关键词标签等。
 */

import { claudeMessages } from "@/lib/claude-client";
import type { EtsyProductRaw } from "./scraper";

export type EtsyAiAnalysis = {
  sellingPoints: string;     // 产品核心卖点（中文，200字内）
  pricingStrategy: string;   // 定价策略分析（中文）
  keywords: string[];        // 推荐关键词 & 标签（英文，10-15个）
  targetAudience: string;    // 目标客群（中文，100字内）
  summary: string;           // 一句话总结（中文，50字内）
};

export type BatchAnalysisInput = {
  listingId: string;
  title: string;
  price: number | null;
  shopSales: number | null;
  reviewCount: number | null;
  rating: number | null;
  tags: string[];
};

/**
 * 批量分析 Etsy 产品（一次 Claude 调用分析多个产品节省 token）
 */
export async function analyzeEtsyProductsBatch(
  products: BatchAnalysisInput[],
  keyword: string
): Promise<Map<string, EtsyAiAnalysis>> {
  const result = new Map<string, EtsyAiAnalysis>();
  if (products.length === 0) return result;

  const productList = products
    .map(
      (p, i) =>
        `[${i + 1}] listingId: ${p.listingId}
标题: ${p.title}
价格: ${p.price != null ? `$${p.price}` : "未知"}
店铺销量: ${p.shopSales != null ? p.shopSales.toLocaleString() : "未知"}
评论数: ${p.reviewCount != null ? p.reviewCount : "未知"}
评分: ${p.rating != null ? p.rating : "未知"}
标签: ${p.tags.length > 0 ? p.tags.join(", ") : "无"}`
    )
    .join("\n\n");

  const system = `你是一个专业的 Etsy 跨境电商选品顾问，擅长分析 Etsy 平台上的热卖产品。
请根据产品标题、价格、销量数据和标签，分析产品的核心卖点和市场定位。
回复必须是有效的 JSON 格式。`;

  const user = `搜索关键词: "${keyword}"

以下是 ${products.length} 个 Etsy 产品，请逐一分析每个产品：

${productList}

请输出一个 JSON 数组，每个元素对应上面一个产品（按顺序，listingId 一一对应），格式如下：
[
  {
    "listingId": "产品ID",
    "sellingPoints": "核心卖点分析，包括产品特点、材质工艺、设计亮点、与关键词的匹配程度等（150-200字，中文）",
    "pricingStrategy": "定价策略分析：该价位的竞争力、目标客群的消费能力匹配、利润空间评估（80-120字，中文）",
    "keywords": ["英文关键词1", "英文关键词2", "...（10-15个，包含长尾词）"],
    "targetAudience": "目标客群：年龄层、消费习惯、使用场景、购买动机（80-100字，中文）",
    "summary": "一句话精华总结，适合用于选品备注（30-50字，中文）"
  }
]

注意：
1. 仅输出 JSON 数组，不要有任何额外的文字
2. sellingPoints 要结合关键词"${keyword}"分析该产品在此搜索场景下的优势
3. keywords 要覆盖产品特征、使用场景、目标人群等维度`;

  try {
    const raw = await claudeMessages({
      system,
      user,
      maxTokens: 8000,
    });

    if (!raw) return result;

    // Extract JSON
    const jsonMatch =
      raw.match(/```(?:json)?\s*([\s\S]*?)```/) ||
      raw.match(/(\[[\s\S]*\])/);
    const jsonStr = jsonMatch?.[1]?.trim() ?? raw.trim();

    const parsed = JSON.parse(jsonStr) as Array<{
      listingId: string;
      sellingPoints: string;
      pricingStrategy: string;
      keywords: string[];
      targetAudience: string;
      summary: string;
    }>;

    for (const item of parsed) {
      if (!item.listingId) continue;
      result.set(item.listingId, {
        sellingPoints: item.sellingPoints ?? "",
        pricingStrategy: item.pricingStrategy ?? "",
        keywords: Array.isArray(item.keywords) ? item.keywords : [],
        targetAudience: item.targetAudience ?? "",
        summary: item.summary ?? "",
      });
    }
  } catch (e) {
    console.error("[analyzeEtsyProductsBatch] Error:", e);
  }

  return result;
}

/**
 * 分析单个 Etsy 产品（适合详情页深度分析）
 */
export async function analyzeEtsyProductSingle(
  product: EtsyProductRaw,
  keyword: string
): Promise<EtsyAiAnalysis | null> {
  const system = `你是一个专业的 Etsy 跨境电商选品顾问。
请根据产品信息输出 JSON 格式的分析结果，不要有任何额外文字。`;

  const user = `搜索关键词: "${keyword}"

产品信息：
- 标题: ${product.title}
- 价格: ${product.price != null ? `$${product.price} ${product.currencyCode ?? "USD"}` : "未知"}
- 店铺: ${product.shopName}
- 店铺总销量: ${product.shopSales != null ? product.shopSales.toLocaleString() + " 单" : "未知"}
- 评论数: ${product.reviewCount != null ? product.reviewCount : "未知"}
- 评分: ${product.rating != null ? product.rating + "/5" : "未知"}
- 收藏数: ${product.favoriteCount != null ? product.favoriteCount : "未知"}
- 标签: ${product.tags.length > 0 ? product.tags.join(", ") : "无"}
- 链接: ${product.url}

请输出以下 JSON 格式（不要有任何额外的文字）：
{
  "sellingPoints": "核心卖点分析，200字以内，中文",
  "pricingStrategy": "定价策略分析，120字以内，中文",
  "keywords": ["英文关键词1", "英文关键词2"],
  "targetAudience": "目标客群，100字以内，中文",
  "summary": "一句话总结，50字以内，中文"
}`;

  try {
    const raw = await claudeMessages({ system, user, maxTokens: 2000 });
    if (!raw) return null;

    const jsonMatch =
      raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
      raw.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch?.[1]?.trim() ?? raw.trim();

    const parsed = JSON.parse(jsonStr) as EtsyAiAnalysis;
    return {
      sellingPoints: parsed.sellingPoints ?? "",
      pricingStrategy: parsed.pricingStrategy ?? "",
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      targetAudience: parsed.targetAudience ?? "",
      summary: parsed.summary ?? "",
    };
  } catch (e) {
    console.error("[analyzeEtsyProductSingle] Error:", e);
    return null;
  }
}
