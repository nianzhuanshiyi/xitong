import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
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

  const batch = await prisma.smartSelectionScanBatch.findFirst({
    where: { planId },
    orderBy: { createdAt: "desc" },
  });

  if (!batch) {
    return NextResponse.json({ batch: null, results: [] });
  }

  const results = await prisma.smartSelectionResult.findMany({
    where: {
      batchId: batch.id,
      status: "RECOMMENDED",
    },
    orderBy: { aiScore: "desc" },
  });

  return NextResponse.json({ batch, results });
}
