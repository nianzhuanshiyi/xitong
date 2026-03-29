import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  asin: z.string().max(20).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  targetMarket: z.string().max(10).default("US"),
  status: z
    .enum(["idea", "research", "sampling", "testing", "listing", "launched", "abandoned"])
    .default("idea"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  description: z.string().max(5000).optional().nullable(),
  targetPrice: z.number().optional().nullable(),
  estimatedCost: z.number().optional().nullable(),
  estimatedProfit: z.number().optional().nullable(),
  moq: z.number().int().optional().nullable(),
  competitorAsins: z.string().optional().nullable(),
  marketSize: z.string().max(200).optional().nullable(),
  competitionLevel: z.string().max(50).optional().nullable(),
  supplierName: z.string().max(200).optional().nullable(),
  supplierContact: z.string().max(200).optional().nullable(),
  sampleStatus: z
    .enum(["not_ordered", "ordered", "received", "approved", "rejected"])
    .optional()
    .nullable(),
  sampleCost: z.number().optional().nullable(),
  diffPoints: z.string().max(2000).optional().nullable(),
  painPoints: z.string().max(2000).optional().nullable(),
  ideaDate: z.coerce.date().optional(),
  targetLaunchDate: z.coerce.date().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  imageUrl: z.string().max(500).optional().nullable(),
});

/** GET /api/product-dev — 列表（支持 status / priority / market 筛选） */
export async function GET(req: Request) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const market = searchParams.get("market");
  const q = searchParams.get("q");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (market) where.targetMarket = market;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { asin: { contains: q } },
      { description: { contains: q } },
    ];
  }

  const rows = await prisma.productDev.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    include: {
      _count: { select: { tasks: true, logs: true } },
    },
  });

  return NextResponse.json(rows);
}

/** POST /api/product-dev — 新建产品开发项目 */
export async function POST(req: Request) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "无效的 JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "参数错误", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const row = await prisma.productDev.create({
    data: {
      ...data,
      createdBy: session.user.id,
    },
  });

  // 写日志
  await prisma.productDevLog.create({
    data: {
      productId: row.id,
      action: "create",
      content: `创建产品开发项目「${row.name}」`,
      createdBy: session.user.id,
    },
  });

  return NextResponse.json(row, { status: 201 });
}
