import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { extractTextFromSupplierFile } from "@/lib/supplier-file-text";
import { aiAnalyzeFileByCategory } from "@/lib/supplier-ai";
import { absolutePathFromRelative } from "@/lib/supplier-uploads";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { error } = await requireModuleAccess("suppliers");
  if (error) return error;
  const { id, fileId } = await params;

  const f = await prisma.supplierFile.findFirst({
    where: { id: fileId, supplierId: id },
  });
  if (!f) return NextResponse.json({ message: "未找到" }, { status: 404 });

  const abs = absolutePathFromRelative(f.relativePath);
  const text = await extractTextFromSupplierFile(abs, f.mimeType, f.originalName);
  const structured = await aiAnalyzeFileByCategory({
    category: f.category,
    originalName: f.originalName,
    text,
  });

  if (!structured) {
    return NextResponse.json(
      { message: "AI 未返回结果（请检查 Claude API 密钥）" },
      { status: 502 }
    );
  }

  const summary =
    typeof structured === "object" && structured && "summary" in structured
      ? String((structured as { summary?: string }).summary ?? "")
      : JSON.stringify(structured);

  let complianceNotes: string | null = null;
  if (
    f.category === "TEST_REPORT" &&
    structured &&
    typeof structured === "object" &&
    "amazonCompliance" in structured
  ) {
    const ac = (structured as { amazonCompliance?: { ok: boolean; notes: string } })
      .amazonCompliance;
    complianceNotes = ac ? JSON.stringify(ac) : null;
  }

  let certExpiryDate: Date | null = null;
  if (
    f.category === "CERTIFICATION" &&
    structured &&
    typeof structured === "object" &&
    "expiryDate" in structured
  ) {
    const ed = (structured as { expiryDate?: string | null }).expiryDate;
    if (ed) {
      const d = new Date(ed);
      if (!Number.isNaN(d.getTime())) certExpiryDate = d;
    }
  }

  const analysis = await prisma.supplierFileAnalysis.upsert({
    where: { fileId },
    create: {
      fileId,
      summary,
      structuredJson: JSON.stringify(structured),
      complianceNotes,
      certExpiryDate,
      rawResponse: null,
    },
    update: {
      summary,
      structuredJson: JSON.stringify(structured),
      complianceNotes,
      certExpiryDate,
    },
  });

  await prisma.supplier.update({
    where: { id },
    data: { lastActivityAt: new Date() },
  });

  return NextResponse.json(analysis);
}
