/**
 * POST /api/etsy/search
 * 创建 Etsy 关键词搜索任务，异步执行爬取 + AI 分析
 */

import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { searchEtsy } from "@/lib/etsy/scraper";
import { analyzeEtsyProductsBatch } from "@/lib/etsy/ai-analyzer";

const bodySchema = z.object({
  keyword: z.string().min(1).max(200),
  minShopSales: z.number().int().min(0).optional(),
  minReviews: z.number().int().min(0).optional(),
  minRating: z.number().min(0).max(5).optional(),
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  maxPages: z.number().int().min(1).max(5).optional(),
  aiAnalyze: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "无效的请求体" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "参数错误" },
      { status: 400 }
    );
  }

  const {
    keyword,
    minShopSales,
    minReviews,
    minRating,
    minPrice,
    maxPrice,
    maxPages = 3,
    aiAnalyze = true,
  } = parsed.data;

  const filtersJson = JSON.stringify({
    minShopSales,
    minReviews,
    minRating,
    minPrice,
    maxPrice,
    maxPages,
    aiAnalyze,
  });

  // Create task record
  const task = await prisma.etsySearchTask.create({
    data: {
      userId: session.user.id,
      keyword,
      status: "running",
      filtersJson,
    },
  });

  // Run async (fire and forget, update DB when done)
  void runSearchTask({
    taskId: task.id,
    keyword,
    minShopSales,
    minReviews,
    minRating,
    minPrice,
    maxPrice,
    maxPages,
    aiAnalyze,
  });

  return NextResponse.json({ taskId: task.id, status: "running" }, { status: 201 });
}

async function runSearchTask(opts: {
  taskId: string;
  keyword: string;
  minShopSales?: number;
  minReviews?: number;
  minRating?: number;
  minPrice?: number;
  maxPrice?: number;
  maxPages: number;
  aiAnalyze: boolean;
}) {
  const { taskId, keyword, aiAnalyze, ...scrapeOpts } = opts;

  try {
    // 1. Scrape Etsy
    const products = await searchEtsy(
      { keyword, ...scrapeOpts },
      (msg) => console.log(`[etsy-task:${taskId}] ${msg}`)
    );

    if (products.length === 0) {
      await prisma.etsySearchTask.update({
        where: { id: taskId },
        data: { status: "done", totalFound: 0 },
      });
      return;
    }

    // 2. Save products to DB
    for (const p of products) {
      await prisma.etsyProduct.create({
        data: {
          taskId,
          listingId: p.listingId,
          url: p.url,
          title: p.title,
          price: p.price,
          currencyCode: p.currencyCode,
          shopName: p.shopName,
          shopUrl: p.shopUrl,
          shopSales: p.shopSales,
          favoriteCount: p.favoriteCount,
          reviewCount: p.reviewCount,
          rating: p.rating,
          tagsJson: JSON.stringify(p.tags),
          imageUrl: p.imageUrl,
        },
      }).catch(() => { /* ignore duplicates */ });
    }

    // 3. AI analysis in batches of 5
    if (aiAnalyze) {
      const batchSize = 5;
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);
        const inputs = batch.map((p) => ({
          listingId: p.listingId,
          title: p.title,
          price: p.price,
          shopSales: p.shopSales,
          reviewCount: p.reviewCount,
          rating: p.rating,
          tags: p.tags,
        }));

        try {
          const analysisMap = await analyzeEtsyProductsBatch(inputs, keyword);

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
          }
        } catch (e) {
          console.error(`[etsy-task:${taskId}] AI batch ${i}-${i + batchSize} error:`, e);
        }

        // Rate limit delay
        if (i + batchSize < products.length) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }

    // 4. Mark task done
    await prisma.etsySearchTask.update({
      where: { id: taskId },
      data: { status: "done", totalFound: products.length },
    });
  } catch (e) {
    console.error(`[etsy-task:${taskId}] Fatal error:`, e);
    await prisma.etsySearchTask
      .update({
        where: { id: taskId },
        data: {
          status: "failed",
          errorMessage: e instanceof Error ? e.message : "未知错误",
        },
      })
      .catch(() => {});
  }
}
