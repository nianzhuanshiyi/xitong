import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { aiSupplierEvaluation } from "@/lib/supplier-ai";
import { extractTextFromSupplierFile } from "@/lib/supplier-file-text";
import { absolutePathFromRelative } from "@/lib/supplier-uploads";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireModuleAccess("suppliers");
  if (error) return error;
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

  // Extract text content from files that haven't been analyzed yet
  const fileAnalyses = await Promise.all(
    s.files.map(async (f) => {
      if (f.analysis?.summary) {
        return {
          name: f.originalName,
          category: f.category,
          summary: f.analysis.summary,
        };
      }
      // No analysis exists — extract PDF/text content directly
      const absPath = absolutePathFromRelative(f.relativePath);
      const textContent = await extractTextFromSupplierFile(
        absPath,
        f.mimeType,
        f.originalName
      );
      // Truncate for evaluation context (keep under 8k per file)
      const truncated = textContent.slice(0, 8000);
      return {
        name: f.originalName,
        category: f.category,
        summary: null as string | null,
        extractedContent: truncated,
      };
    })
  );

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
    fileAnalyses,
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
