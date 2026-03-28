import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  asin: z.string().min(8).max(20),
  marketplace: z.string().min(1).max(16),
  productJson: z.string().max(800_000).optional(),
  imageUrl: z.string().max(2000).optional().nullable(),
  title: z.string().max(4000).optional().nullable(),
  price: z.number().optional().nullable(),
  bsr: z.number().int().optional().nullable(),
  rating: z.number().optional().nullable(),
  reviewCount: z.number().int().optional().nullable(),
  monthlySales: z.number().int().optional().nullable(),
  aiScore: z.number().int().min(0).max(100).optional().nullable(),
  aiSummary: z.string().max(8000).optional().nullable(),
  aiJson: z.string().max(800_000).optional().nullable(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ planId: string }> }
) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const { planId } = await params;

  const plan = await prisma.smartSelectionPlan.findUnique({
    where: { id: planId },
    select: { id: true },
  });
  if (!plan) {
    return NextResponse.json({ message: "未找到" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "无效的 JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "参数错误", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const asin = parsed.data.asin.trim().toUpperCase();
  const productJson = parsed.data.productJson ?? "{}";

  const existing = await prisma.smartSelectionResult.findFirst({
    where: { planId, asin },
    orderBy: { createdAt: "desc" },
  });

  const data = {
    status: "CANDIDATE" as const,
    marketplace: parsed.data.marketplace,
    productJson,
    imageUrl: parsed.data.imageUrl ?? null,
    title: parsed.data.title ?? null,
    price: parsed.data.price ?? null,
    bsr: parsed.data.bsr ?? null,
    rating: parsed.data.rating ?? null,
    reviewCount: parsed.data.reviewCount ?? null,
    monthlySales: parsed.data.monthlySales ?? null,
    aiScore: parsed.data.aiScore ?? null,
    aiSummary: parsed.data.aiSummary ?? null,
    aiJson: parsed.data.aiJson ?? null,
  };

  if (existing) {
    const row = await prisma.smartSelectionResult.update({
      where: { id: existing.id },
      data,
    });
    return NextResponse.json(row);
  }

  const row = await prisma.smartSelectionResult.create({
    data: {
      planId,
      asin,
      ...data,
    },
  });
  return NextResponse.json(row, { status: 201 });
}
