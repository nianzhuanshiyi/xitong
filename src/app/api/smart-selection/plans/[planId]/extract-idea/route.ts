import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";
import { claudeMessages } from "@/lib/claude-client";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  resultId: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const { session, error } = await requireModuleAccess("selection-analysis");
  if (error) return error;

  const { planId } = await params;
  const plan = await prisma.smartSelectionPlan.findUnique({ where: { id: planId } });
  if (!plan) return NextResponse.json({ message: "方案不存在" }, { status: 404 });
  if (plan.createdById !== session!.user.id) return NextResponse.json({ message: "无权限" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ message: "无效JSON" }, { status: 400 }); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "参数错误" }, { status: 400 });

  const result = await prisma.smartSelectionResult.findUnique({ where: { id: parsed.data.resultId } });
  if (!result || result.planId !== planId) {
    return NextResponse.json({ message: "产品不存在" }, { status: 404 });
  }

  try {
    const asin = result.asin;
    const marketplace = result.marketplace || "US";

    // Parse product data from stored JSON
    let productData: Record<string, unknown> = {};
    try { productData = JSON.parse(result.productJson) as Record<string, unknown>; } catch { /* empty */ }

    // Fetch reviews (1-3 stars) via Sellersprite
    console.info(`[extract-idea] Fetching reviews for ${asin}...`);
    const mcp = createSellerspriteMcpClient();
    const reviewRes = await mcp.callToolSafe("review", {
      asin,
      marketplace,
      size: 20,
    });

    let reviewTexts = "暂无差评数据";
    if (reviewRes.ok && reviewRes.data) {
      const reviews = extractReviews(reviewRes.data);
      // Filter to low ratings (1-3 stars)
      const lowRating = reviews.filter((r) => r.rating <= 3);
      if (lowRating.length > 0) {
        reviewTexts = lowRating.slice(0, 15).map((r) =>
          `[${r.rating}星] ${r.title ? r.title + ": " : ""}${r.content.slice(0, 200)}`
        ).join("\n\n");
      } else if (reviews.length > 0) {
        // No low-rating reviews, use all reviews
        reviewTexts = "该产品差评很少。以下是部分评论：\n" + reviews.slice(0, 10).map((r) =>
          `[${r.rating}星] ${r.content.slice(0, 150)}`
        ).join("\n\n");
      }
    }

    // Build product info string
    const title = str(productData.title) || result.title || asin;
    const price = result.price ?? num(productData.price);
    const totalUnits = result.monthlySales ?? num(productData.totalUnits);
    const totalRevenue = num(productData.totalRevenue) || num(productData.totalAmount);
    const rating = result.rating ?? num(productData.rating);
    const ratings = result.reviewCount ?? num(productData.ratings);
    const brand = str(productData.brand) || "未知";
    const shelfDate = str(productData.shelfDate) || str(productData.availableDate) || "未知";

    console.info(`[extract-idea] Calling Claude for ${asin}...`);
    const analysis = await claudeMessages({
      system: `你是一位资深亚马逊选品专家。你的任务是分析一个真实在售的亚马逊产品，提取它的亮点和用户痛点，然后设计一个改进版产品。

请按以下格式输出：

1.【产品亮点】（这个产品为什么能卖出去？提取3-5个核心亮点）
2.【用户痛点】（差评中反复出现的具体问题，提取3-5个，每个痛点后注明出现频率）
3.【改进方案】（保留亮点、解决痛点，设计一个改进版产品：产品名称、核心改进点、差异化卖点）
4.【定价建议】（参考原产品价格，给出建议售价和预估利润率）
5.【供应链建议】（中国/韩国/美国哪条供应链更适合？为什么？）
6.【风险提醒】（做这个产品最大的风险是什么？一句话）

严格基于给定的真实产品数据和评论分析，不要编造信息。`,
      user: `产品信息：
ASIN：${asin}
标题：${title}
价格：$${price ?? "未知"}
月销量：${totalUnits ?? "未知"}
月收入：$${totalRevenue ?? "未知"}
评分：${rating ?? "未知"}
评论数：${ratings ?? "未知"}
品牌：${brand}
上架时间：${shelfDate}

差评与评论内容：
${reviewTexts}`,
    });

    if (!analysis) throw new Error("Claude 分析失败");

    // Save to SmartSelectionResult
    await prisma.smartSelectionResult.update({
      where: { id: result.id },
      data: {
        aiSummary: analysis,
        status: "CANDIDATE",
      },
    });

    console.info(`[extract-idea] Done for ${asin}, analysis length: ${analysis.length}`);

    return NextResponse.json({ ok: true, analysis });
  } catch (e) {
    console.error("[extract-idea] Error:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "创意提取失败" },
      { status: 500 }
    );
  }
}

/* ── Helpers ── */

type ReviewItem = { rating: number; title: string; content: string };

function extractReviews(data: unknown): ReviewItem[] {
  if (!data || typeof data !== "object") return [];
  const items = findArray(data);
  return items.map((item) => {
    const o = item as Record<string, unknown>;
    return {
      rating: typeof o.rating === "number" ? o.rating : typeof o.star === "number" ? o.star : 5,
      title: typeof o.title === "string" ? o.title : "",
      content: typeof o.content === "string" ? o.content : typeof o.body === "string" ? o.body : typeof o.text === "string" ? o.text : "",
    };
  }).filter((r) => r.content.length > 0);
}

function findArray(obj: unknown, depth = 0): unknown[] {
  if (depth > 5 || !obj || typeof obj !== "object") return [];
  if (Array.isArray(obj) && obj.length > 0 && typeof obj[0] === "object") return obj;
  const o = obj as Record<string, unknown>;
  for (const key of ["items", "data", "reviews", "comments"]) {
    if (Array.isArray(o[key])) return o[key] as unknown[];
  }
  for (const v of Object.values(o)) {
    const r = findArray(v, depth + 1);
    if (r.length > 0) return r;
  }
  return [];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) ? v : null;
}
