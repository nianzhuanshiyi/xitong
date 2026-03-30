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

  const [
    totalResults,
    recommended,
    candidate,
    excluded,
    passedHard,
    rejectedAi,
    excludeListCount,
  ] = await Promise.all([
    prisma.smartSelectionResult.count({ where: { planId } }),
    prisma.smartSelectionResult.count({
      where: { planId, status: "RECOMMENDED" },
    }),
    prisma.smartSelectionResult.count({
      where: { planId, status: "CANDIDATE" },
    }),
    prisma.smartSelectionResult.count({
      where: { planId, status: "EXCLUDED" },
    }),
    prisma.smartSelectionResult.count({
      where: { planId, status: "PASSED_HARD" },
    }),
    prisma.smartSelectionResult.count({
      where: { planId, status: "REJECTED_AI" },
    }),
    prisma.smartSelectionExcludeList.count({ where: { planId } }),
  ]);

  const latestBatch = await prisma.smartSelectionScanBatch.findFirst({
    where: { planId },
    orderBy: { createdAt: "desc" },
  });

  let lastRunStats: Record<string, number> | null = null;
  if (latestBatch?.statsJson) {
    try {
      lastRunStats = JSON.parse(latestBatch.statsJson) as Record<
        string,
        number
      >;
    } catch {
      lastRunStats = null;
    }
  }

  return NextResponse.json({
    totalResults,
    recommended,
    candidate,
    excluded,
    passedHard,
    rejectedAi,
    excludeListCount,
    lastBatchAt: latestBatch?.createdAt ?? null,
    lastRunStats,
  });
}
