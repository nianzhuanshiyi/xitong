/**
 * POST /api/etsy/tasks/[taskId]/analyze
 * 对任务中指定产品（或全部）触发 AI 分析
 */

import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { analyzeEtsyProductsBatch } from "@/lib/etsy/ai-analyzer";

const bodySchema = z.object({
  /** 要分析的产品 ID 列表（DB id），为空则分析全部未分析产品 */
  productIds: z.array(z.string()).optional(),
});

type Params = { params: Promise<{ taskId: string }> };

export async function POST(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { taskId } = await params;

  const task = await prisma.etsySearchTask.findUnique({
    where: { id: taskId },
    select: { id: true, userId: true, keyword: true, status: true },
  });

  if (!task) {
    return NextResponse.json({ message: "任务不存在" }, { status: 404 });
  }
  if (task.userId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "参数错误" }, { status: 400 });
  }

  const { productIds } = parsed.data;

  // Load products to analyze
  const products = await prisma.etsyProduct.findMany({
    where: {
      taskId,
      ...(productIds && productIds.length > 0
        ? { id: { in: productIds } }
        : { aiAnalyzed: false }),
    },
    orderBy: [{ shopSales: "desc" }],
    take: 20, // max 20 per call
  });

  if (products.length === 0) {
    return NextResponse.json({ message: "没有需要分析的产品", analyzed: 0 });
  }

  // Batch analyze
  const inputs = products.map((p) => ({
    listingId: p.listingId,
    title: p.title,
    price: p.price,
    shopSales: p.shopSales,
    reviewCount: p.reviewCount,
    rating: p.rating,
    tags: safeParseJson<string[]>(p.tagsJson, []),
  }));

  let analyzed = 0;
  const batchSize = 5;

  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize);
    const analysisMap = await analyzeEtsyProductsBatch(batch, task.keyword);

    for (const entry of Array.from(analysisMap.entries())) {
      const [listingId, analysis] = entry;
      await prisma.etsyProduct.updateMany({
        where: { taskId, listingId },
        data: {
          aiAnalyzed: true,
          aiSellingPoints: analysis.sellingPoints,
          aiPricingStrategy: analysis.pricingStrategy,
          aiKeywords: JSON.stringify(analysis.keywords),
          aiTargetAudience: analysis.targetAudience,
          aiSummary: analysis.summary,
        },
      });
      analyzed++;
    }

    if (i + batchSize < inputs.length) {
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  return NextResponse.json({ analyzed, total: products.length });
}

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
