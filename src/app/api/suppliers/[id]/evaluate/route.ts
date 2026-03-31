import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { extractTextFromSupplierFile } from "@/lib/supplier-file-text";
import { absolutePathFromRelative } from "@/lib/supplier-uploads";
import { callClaudeWithPdf } from "@/lib/claude-pdf";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireModuleAccess("suppliers");
  if (error) return error;
  const { id } = await params;

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    console.error("[EVALUATE] ANTHROPIC_API_KEY is not set!");
    return NextResponse.json(
      { error: "Claude API 密钥未配置，请联系管理员" },
      { status: 500 }
    );
  }
  console.log("[EVALUATE] API key found, first 10 chars:", apiKey.slice(0, 10));

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

  // For unanalyzed PDFs, use Claude native PDF to get summaries first (max 2)
  let pdfSummaryCount = 0;
  const MAX_PDF_SUMMARIES = 2;

  const fileAnalyses = await Promise.all(
    s.files.map(async (f) => {
      if (f.analysis?.summary) {
        console.log("[EVALUATE] File:", f.originalName, "→ using existing analysis summary");
        return {
          name: f.originalName,
          category: f.category,
          summary: f.analysis.summary,
        };
      }

      const isPdf = f.mimeType.toLowerCase() === "application/pdf";

      // For unanalyzed PDFs: use Claude native PDF (limited to 2 to avoid token overflow)
      if (isPdf && pdfSummaryCount < MAX_PDF_SUMMARIES) {
        const absPath = absolutePathFromRelative(f.relativePath);
        let buf: Buffer | null = null;
        if (existsSync(absPath)) {
          buf = await readFile(absPath);
        } else if (f.fileData) {
          buf = Buffer.from(f.fileData);
        }

        if (buf) {
          try {
            pdfSummaryCount++;
            console.log("[EVALUATE] Using Claude native PDF for:", f.originalName);
            const base64 = buf.toString("base64");
            const pdfSummary = await callClaudeWithPdf(
              base64,
              "Summarize this supplier document in 2-3 sentences in Chinese. Focus on key facts: products, prices, certifications, or capabilities.",
              `请用中文总结这个供应商文件: ${f.originalName}`
            );
            return {
              name: f.originalName,
              category: f.category,
              summary: pdfSummary.slice(0, 2000),
            };
          } catch (e) {
            console.error("[EVALUATE] Claude PDF failed for:", f.originalName, e);
          }
        }
      }

      // Non-PDF or fallback: extract text
      const absPath = absolutePathFromRelative(f.relativePath);
      const localExists = existsSync(absPath);
      console.log("[EVALUATE] File:", f.originalName, "localExists:", localExists, "hasDbData:", !!f.fileData);

      let textContent: string;
      if (localExists) {
        textContent = await extractTextFromSupplierFile(absPath, f.mimeType, f.originalName);
      } else if (f.fileData) {
        const dbBuf = Buffer.from(f.fileData);
        textContent = await extractTextFromSupplierFile(dbBuf, f.mimeType, f.originalName);
      } else {
        textContent = `[文件需要重新上传] ${f.originalName}（本地文件已丢失且数据库中无备份数据）`;
      }

      console.log("[EVALUATE] Extracted text length:", textContent.length);

      return {
        name: f.originalName,
        category: f.category,
        summary: null as string | null,
        extractedContent: textContent.slice(0, 8000),
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

  const systemPrompt =
    "Evaluate supplier for cross-border e-commerce. overallScore 1-5 number. JSON keys: overallScore, strengths[], risks[], recommendedCategories[] (Chinese), demandMatchNote (Chinese). Return ONLY valid JSON, no markdown.";

  console.log("[EVALUATE] Calling Anthropic API, model: claude-sonnet-4-20250514");

  let evalResult: {
    overallScore: number;
    strengths: string[];
    risks: string[];
    recommendedCategories: string[];
    demandMatchNote: string;
  } | null = null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: JSON.stringify(payload) }],
      }),
    });

    const rawText = await res.text();
    console.log("[EVALUATE] API response status:", res.status);

    if (!res.ok) {
      console.error("[EVALUATE] API error:", rawText.slice(0, 500));
      return NextResponse.json(
        { message: `Claude API 错误 (${res.status}): ${rawText.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = JSON.parse(rawText) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const aiText =
      data.content
        ?.filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("") ?? "";

    console.log("[EVALUATE] AI raw response (first 500 chars):", aiText.slice(0, 500));

    if (!aiText.trim()) {
      return NextResponse.json({ message: "AI 返回空内容" }, { status: 502 });
    }

    let cleaned = aiText.trim();
    if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        evalResult = JSON.parse(jsonMatch[0]);
      } catch {
        console.error("[EVALUATE] JSON parse failed. Raw:", aiText.slice(0, 800));
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[EVALUATE] API call failed:", msg);
    return NextResponse.json({ message: `AI 调用失败: ${msg}` }, { status: 502 });
  }

  if (!evalResult) {
    return NextResponse.json(
      { message: "AI 未返回有效结果（JSON 解析失败）" },
      { status: 502 }
    );
  }

  console.log("[EVALUATE] Result:", JSON.stringify(evalResult).slice(0, 300));

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
