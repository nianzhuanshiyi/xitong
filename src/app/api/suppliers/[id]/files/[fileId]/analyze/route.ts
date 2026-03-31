import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { extractTextFromSupplierFile } from "@/lib/supplier-file-text";
import { absolutePathFromRelative } from "@/lib/supplier-uploads";

export const dynamic = "force-dynamic";

// Category-specific system prompts
const CATEGORY_PROMPTS: Record<string, string> = {
  CATALOG:
    "Extract product catalog structure. Return ONLY valid JSON, no markdown. JSON: {summary, products:[{name, specs, highlights}]}. Chinese for summary.",
  PRICE_LIST:
    "Extract pricing. Mark competitive:true for unusually good value vs peers if inferable. Return ONLY valid JSON, no markdown. JSON: {summary, items:[{skuOrName, price, moq, note, competitive}]}.",
  TEST_REPORT:
    "Assess Amazon US compliance heuristically from test report text. Return ONLY valid JSON, no markdown. JSON: {summary, tests:[{name, result, pass}], amazonCompliance:{ok, notes}}.",
  CERTIFICATION:
    "Identify certificate. expiryDate as ISO date YYYY-MM-DD or null. Return ONLY valid JSON, no markdown. JSON: {summary, certType, expiryDate, issuer}.",
};

const DEFAULT_PROMPT =
  "Summarize this supplier document in Chinese. Return ONLY valid JSON, no markdown. JSON: {summary, details}.";

function extractJson(rawText: string): Record<string, unknown> | null {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { error } = await requireModuleAccess("suppliers");
  if (error) return error;
  const { id, fileId } = await params;

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    console.error("[ANALYZE] ANTHROPIC_API_KEY is not set!");
    return NextResponse.json(
      { error: "Claude API 密钥未配置，请联系管理员" },
      { status: 500 }
    );
  }

  const f = await prisma.supplierFile.findFirst({
    where: { id: fileId, supplierId: id },
  });
  if (!f) return NextResponse.json({ message: "未找到" }, { status: 404 });

  // Resolve file data: local filesystem first, then database
  const abs = absolutePathFromRelative(f.relativePath);
  const localExists = existsSync(abs);
  let text: string;

  if (localExists) {
    text = await extractTextFromSupplierFile(abs, f.mimeType, f.originalName);
  } else if (f.fileData) {
    const dbBuf = Buffer.from(f.fileData);
    text = await extractTextFromSupplierFile(dbBuf, f.mimeType, f.originalName);
  } else {
    return NextResponse.json(
      { message: "文件需要重新上传（本地文件已丢失且数据库中无备份）" },
      { status: 404 }
    );
  }

  console.log("[ANALYZE] File:", f.originalName, "category:", f.category, "text length:", text.length);

  // Direct Anthropic API call
  const systemPrompt = CATEGORY_PROMPTS[f.category] || DEFAULT_PROMPT;
  const userPrompt = `Document: ${f.originalName}\n\n${text.slice(0, 45_000)}`;

  let structured: Record<string, unknown> | null = null;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[ANALYZE] API error:", response.status, errText.slice(0, 500));
      return NextResponse.json(
        { error: `AI 调用失败: ${response.status}` },
        { status: 500 }
      );
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const rawText =
      data.content
        ?.filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("") || "";

    console.log("[ANALYZE] AI raw response (first 500 chars):", rawText.slice(0, 500));

    structured = extractJson(rawText);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ANALYZE] API call failed:", msg);
    return NextResponse.json({ error: `AI 调用失败: ${msg}` }, { status: 500 });
  }

  if (!structured) {
    return NextResponse.json(
      { message: "AI 未返回结果（请检查 Claude API 密钥）" },
      { status: 502 }
    );
  }

  const summary =
    "summary" in structured
      ? String(structured.summary ?? "")
      : JSON.stringify(structured);

  let complianceNotes: string | null = null;
  if (f.category === "TEST_REPORT" && "amazonCompliance" in structured) {
    const ac = structured.amazonCompliance as {
      ok: boolean;
      notes: string;
    } | null;
    complianceNotes = ac ? JSON.stringify(ac) : null;
  }

  let certExpiryDate: Date | null = null;
  if (f.category === "CERTIFICATION" && "expiryDate" in structured) {
    const ed = structured.expiryDate as string | null;
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
