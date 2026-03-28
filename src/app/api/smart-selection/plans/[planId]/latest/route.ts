import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";

export async function GET(
  _req: Request,
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
