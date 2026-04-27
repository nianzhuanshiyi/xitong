/**
 * GET /api/etsy/tasks/[taskId]
 * 获取任务状态和产品列表
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type Params = { params: Promise<{ taskId: string }> };

export async function GET(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { taskId } = await params;

  const task = await prisma.etsySearchTask.findUnique({
    where: { id: taskId },
    include: {
      products: {
        orderBy: [{ shopSales: "desc" }, { reviewCount: "desc" }],
      },
    },
  });

  if (!task) {
    return NextResponse.json({ message: "任务不存在" }, { status: 404 });
  }

  if (task.userId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  return NextResponse.json({
    id: task.id,
    keyword: task.keyword,
    status: task.status,
    totalFound: task.totalFound,
    errorMessage: task.errorMessage,
    filtersJson: task.filtersJson,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    products: task.products.map((p) => ({
      id: p.id,
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
      tags: safeParseJson<string[]>(p.tagsJson, []),
      imageUrl: p.imageUrl,
      aiAnalyzed: p.aiAnalyzed,
      aiSellingPoints: p.aiSellingPoints,
      aiPricingStrategy: p.aiPricingStrategy,
      aiKeywords: safeParseJson<string[]>(p.aiKeywords, []),
      aiTargetAudience: p.aiTargetAudience,
      aiSummary: p.aiSummary,
      createdAt: p.createdAt,
    })),
  });
}

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
