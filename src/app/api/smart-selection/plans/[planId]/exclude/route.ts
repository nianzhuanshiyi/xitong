import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  asin: z.string().min(8).max(20),
  reason: z.string().max(500).optional().nullable(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ planId: string }> }
) {
  const { session, error } = await requireModuleAccess("selection-analysis");
  if (error) return error;
  const { planId } = await params;

  const ok = await prisma.smartSelectionPlan.findUnique({
    where: { id: planId },
    select: { id: true, createdById: true },
  });
  if (!ok) {
    return NextResponse.json({ message: "未找到" }, { status: 404 });
  }
  if (ok.createdById !== session!.user.id) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
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
