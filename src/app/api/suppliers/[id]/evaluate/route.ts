import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { aiSupplierEvaluation } from "@/lib/supplier-ai";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const { id } = await params;

  const s = await prisma.supplier.findUnique({
    where: { id },
    include: {
      files: { include: { analysis: true }, take: 30 },
      orders: { take: 10, orderBy: { orderDate: "desc" } },
      ratings: { take: 5, orderBy: { createdAt: "desc" } },
      qualityIssues: { take: 5, orderBy: { issueDate: "desc" } },
    },
  });
  if (!s) return NextResponse.json({ message: "未找到" }, { status: 404 });

  const payload = {
    name: s.name,
    nameEn: s.nameEn,
    country: s.country,
    mainCategories: s.mainCategories,
    status: s.status,
    moq: s.moq,
    paymentTerms: s.paymentTerms,
    sampleLeadDays: s.sampleLeadDays,
    productionLeadDays: s.productionLeadDays,
    profileSummary: s.profileSummary,
    remarks: s.remarks,
    fileAnalyses: s.files.map((f) => ({
      name: f.originalName,
      category: f.category,
      summary: f.analysis?.summary,
    })),
    recentOrders: s.orders,
    recentRatings: s.ratings,
    qualityIssues: s.qualityIssues,
  };

  const evalResult = await aiSupplierEvaluation({
    supplierJson: JSON.stringify(payload),
  });

  if (!evalResult) {
    return NextResponse.json(
      { message: "AI 未返回结果（请检查 Claude API）" },
      { status: 502 }
    );
  }

  const score = Math.min(5, Math.max(1, Number(evalResult.overallScore) || 3));

  const updated = await prisma.supplier.update({
    where: { id },
    data: {
      overallScore: score,
      aiEvaluationJson: JSON.stringify(evalResult),
      lastActivityAt: new Date(),
    },
  });

  return NextResponse.json({ supplier: updated, evaluation: evalResult });
}
