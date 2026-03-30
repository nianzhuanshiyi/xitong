import { NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import type { AnalysisResult } from "@/lib/product-analysis/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireModuleAccess("selection-analysis");
  if (error) return error;

  const { id } = await params;

  const row = await prisma.analysisCache.findUnique({
    where: { id },
    include: {
      analyzedBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!row) {
    return NextResponse.json({ message: "未找到" }, { status: 404 });
  }

  let result: AnalysisResult | null = null;
  try {
    result = JSON.parse(row.analysisData) as AnalysisResult;
  } catch {
    result = null;
  }

  const analystLabel =
    row.analyzedBy.name?.trim() ||
    row.analyzedBy.email?.trim() ||
    "其他用户";

  return NextResponse.json({
    id: row.id,
    asin: row.asin,
    marketplace: row.marketplace,
    score: row.score,
    expiresAt: row.expiresAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    expired: row.expiresAt.getTime() <= Date.now(),
    analystLabel,
    result,
  });
}
