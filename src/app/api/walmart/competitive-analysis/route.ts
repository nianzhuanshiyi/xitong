import { NextResponse } from "next/server";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { runWalmartCompetitiveAnalysis } from "@/lib/walmart-competitive-analysis/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  competitorUrl: z.string().url("请输入有效链接"),
  forceRefresh: z.boolean().optional(),
  modelConfig: z
    .object({
      reviewWeight: z.number().min(0.02).max(0.5).optional(),
      recent30dWeight: z.number().min(1).max(30).optional(),
      lowRangeFactor: z.number().min(0.4).max(1.2).optional(),
      highRangeFactor: z.number().min(1).max(2.2).optional(),
      rankMultiplierHigh: z.number().min(0.7).max(2.5).optional(),
      rankMultiplierMedium: z.number().min(0.7).max(2.5).optional(),
      rankMultiplierLow: z.number().min(0.5).max(2).optional(),
    })
    .optional(),
});

export async function GET() {
  const { session, error } = await requireModuleAccess("selection-analysis");
  if (error) return error;

  const rows = await prisma.walmartCompetitorAnalysis.findMany({
    where: { userId: session!.user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      competitorUrl: true,
      productId: true,
      productName: true,
      status: true,
      errorMessage: true,
      reportJson: true,
      createdAt: true,
    },
  });

  const list = rows.map((row) => {
    let report: Record<string, unknown> | null = null;
    if (row.reportJson) {
      try {
        report = JSON.parse(row.reportJson) as Record<string, unknown>;
      } catch {
        report = null;
      }
    }
    return {
      id: row.id,
      competitorUrl: row.competitorUrl,
      productId: row.productId,
      productName: row.productName,
      status: row.status,
      errorMessage: row.errorMessage,
      report,
      createdAt: row.createdAt,
    };
  });

  return NextResponse.json({ items: list });
}

export async function POST(req: Request) {
  const { session, error } = await requireModuleAccess("selection-analysis");
  if (error) return error;

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

  try {
    const { analysisId, result, fromCache } = await runWalmartCompetitiveAnalysis({
      competitorUrl: parsed.data.competitorUrl,
      userId: session!.user.id,
      modelConfig: parsed.data.modelConfig,
      forceRefresh: parsed.data.forceRefresh,
    });

    return NextResponse.json({
      analysisId,
      fromCache,
      report: {
        monthlySalesRange: [result.estimate.monthlySalesLow, result.estimate.monthlySalesHigh],
        monthlyRevenueRange: [result.estimate.monthlyRevenueLow, result.estimate.monthlyRevenueHigh],
        confidence: result.estimate.confidence,
        evidence: result.estimate.rationale,
        risks: result.estimate.risks,
        modelDetail: result.estimate.modelDetail,
      },
      data: result,
    });
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "竞品分析失败" },
      { status: 500 }
    );
  }
}
