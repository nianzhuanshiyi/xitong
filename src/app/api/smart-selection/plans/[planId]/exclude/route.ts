import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";

const bodySchema = z.object({
  asin: z.string().min(8).max(20),
  reason: z.string().max(500).optional().nullable(),
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

  const ok = await prisma.smartSelectionPlan.findUnique({
    where: { id: planId },
    select: { id: true },
  });
  if (!ok) {
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

  await prisma.smartSelectionExcludeList.upsert({
    where: {
      planId_asin: { planId, asin },
    },
    create: {
      planId,
      asin,
      reason: parsed.data.reason ?? "不感兴趣",
    },
    update: {
      reason: parsed.data.reason ?? "不感兴趣",
    },
  });

  await prisma.smartSelectionResult.updateMany({
    where: { planId, asin },
    data: { status: "EXCLUDED" },
  });

  return NextResponse.json({ ok: true });
}
