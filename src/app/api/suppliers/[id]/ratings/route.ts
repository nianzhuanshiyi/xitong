import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";

const bodySchema = z.object({
  quality: z.number().int().min(1).max(5),
  priceCompete: z.number().int().min(1).max(5),
  delivery: z.number().int().min(1).max(5),
  communication: z.number().int().min(1).max(5),
  cooperation: z.number().int().min(1).max(5),
  rdCapability: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional().nullable(),
});

function averageOverall(d: z.infer<typeof bodySchema>) {
  const vals = [
    d.quality,
    d.priceCompete,
    d.delivery,
    d.communication,
    d.cooperation,
    d.rdCapability,
  ];
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  const ok = await prisma.supplier.findUnique({ where: { id }, select: { id: true } });
  if (!ok) return NextResponse.json({ message: "未找到" }, { status: 404 });

  const rows = await prisma.supplierRatingEntry.findMany({
    where: { supplierId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(rows);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  const ok = await prisma.supplier.findUnique({ where: { id }, select: { id: true } });
  if (!ok) return NextResponse.json({ message: "未找到" }, { status: 404 });

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

  const row = await prisma.supplierRatingEntry.create({
    data: { supplierId: id, ...parsed.data },
  });

  const overall = averageOverall(parsed.data);
  await prisma.supplier.update({
    where: { id },
    data: {
      overallScore: Math.round(overall * 10) / 10,
      lastActivityAt: new Date(),
    },
  });

  return NextResponse.json(row, { status: 201 });
}
