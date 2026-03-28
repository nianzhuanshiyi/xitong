import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";

const bodySchema = z.object({
  issueDate: z.string().datetime().optional(),
  description: z.string().min(1).max(4000),
  severity: z.string().max(80).optional().nullable(),
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

  const row = await prisma.supplierQualityIssue.create({
    data: {
      supplierId: id,
      issueDate: parsed.data.issueDate
        ? new Date(parsed.data.issueDate)
        : undefined,
      description: parsed.data.description,
      severity: parsed.data.severity ?? undefined,
    },
  });
  await prisma.supplier.update({
    where: { id },
    data: { lastActivityAt: new Date() },
  });
  return NextResponse.json(row, { status: 201 });
}
