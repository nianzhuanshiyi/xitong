import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { extractTextFromSupplierFile } from "@/lib/supplier-file-text";
import { absolutePathFromRelative } from "@/lib/supplier-uploads";
import { getClaudeApiKey } from "@/lib/integration-keys";
import { extractJsonBlock } from "@/lib/claude-client";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireModuleAccess("suppliers");
  if (error) return error;
  const { id } = await params;

  // Validate API key upfront
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || (await getClaudeApiKey());
  if (!apiKey) {
    console.error("[EVALUATE] ANTHROPIC_API_KEY is not set!");
    return NextResponse.json(
      { error: "Claude API 密钥未配置" },
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

  // Direct Anthropic API call instead of claudeJson wrapper
  const systemPrompt = "Evaluate supplier for cross-border e-commerce. overallScore 1-5 number. JSON keys: overallScore, strengths[], risks[], recommendedCategories[] (Chinese), demandMatchNote (Chinese). Return ONLY valid JSON, no markdown.";
  const userPrompt = JSON.stringify(payload);

  console.log("[EVALUATE] Calling Anthropic API directly, model: claude-sonnet-4-20250514");

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
        messages: [{ role: "user", content: userPrompt }],
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
    const aiText = data.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("") ?? "";

    console.log("[EVALUATE] AI raw response (first 500 chars):", aiText.slice(0, 500));

    if (!aiText.trim()) {
      return NextResponse.json(
        { message: "AI 返回空内容" },
        { status: 502 }
      );
    }

    // Robust JSON extraction: strip markdown, regex extract
    const jsonStr = extractJsonBlock(aiText);
    try {
      evalResult = JSON.parse(jsonStr);
    } catch {
      console.error("[EVALUATE] JSON parse failed, trying regex extraction. Raw:", aiText.slice(0, 800));
      const match = aiText.match(/\{[\s\S]*\}/);
      if (match) {
        evalResult = JSON.parse(match[0]);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[EVALUATE] API call failed:", msg);
    return NextResponse.json(
      { message: `AI 调用失败: ${msg}` },
      { status: 502 }
    );
  }

  if (!evalResult) {
    return NextResponse.json(
      { message: "AI 未返回有效结果（JSON 解析失败）" },
      { status: 502 }
    );
  }

  console.log("[EVALUATE] Evaluation result:", JSON.stringify(evalResult).slice(0, 300));

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
