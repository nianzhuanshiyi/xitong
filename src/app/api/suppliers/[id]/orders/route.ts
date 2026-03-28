import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  orderDate: z.string().datetime(),
  productDesc: z.string().min(1).max(2000),
  quantity: z.number().int().min(0).optional().nullable(),
  amount: z.number().optional().nullable(),
  currency: z.string().max(10).optional().nullable(),
  status: z.string().max(120).optional().nullable(),
});

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

  const row = await prisma.supplierOrder.create({
    data: {
      supplierId: id,
      orderDate: new Date(parsed.data.orderDate),
      productDesc: parsed.data.productDesc,
      quantity: parsed.data.quantity ?? undefined,
      amount: parsed.data.amount ?? undefined,
      currency: parsed.data.currency ?? undefined,
      status: parsed.data.status ?? undefined,
    },
  });
  await prisma.supplier.update({
    where: { id },
    data: { lastActivityAt: new Date() },
  });
  return NextResponse.json(row, { status: 201 });
}
