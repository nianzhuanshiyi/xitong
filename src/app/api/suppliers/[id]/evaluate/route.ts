import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
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

  console.log("[EVALUATE] Total files:", s.files.length);

  // Extract text content from each file
  const fileAnalyses = await Promise.all(
    s.files.map(async (f) => {
      // If we already have a good analysis summary, use it
      if (f.analysis?.summary) {
        console.log("[EVALUATE] File:", f.originalName, "→ using existing analysis summary");
        return {
          name: f.originalName,
          category: f.category,
          summary: f.analysis.summary,
        };
      }

      // No analysis — extract text from file directly
      const absPath = absolutePathFromRelative(f.relativePath);
      const localExists = existsSync(absPath);
      console.log("[EVALUATE] File:", f.originalName, "localExists:", localExists, "hasDbData:", !!f.fileData);

      let textContent: string;
      if (localExists) {
        textContent = await extractTextFromSupplierFile(absPath, f.mimeType, f.originalName);
      } else if (f.fileData) {
        // Local file missing (e.g. Railway redeployment) — use DB-stored data
        const dbBuf = Buffer.from(f.fileData);
        textContent = await extractTextFromSupplierFile(dbBuf, f.mimeType, f.originalName);
      } else {
        textContent = `[文件需要重新上传] ${f.originalName}（本地文件已丢失且数据库中无备份数据）`;
      }

      console.log("[EVALUATE] Extracted text length:", textContent.length, "First 200 chars:", textContent.substring(0, 200));

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
