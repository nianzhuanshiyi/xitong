import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { extractTextFromSupplierFile } from "@/lib/supplier-file-text";
import { absolutePathFromRelative } from "@/lib/supplier-uploads";
import { callClaudeWithPdfJson } from "@/lib/claude-pdf";

export const dynamic = "force-dynamic";

// Category-specific system prompts — detailed 300-500 word summaries
const CATEGORY_PROMPTS: Record<string, string> = {
  CATALOG: `你是供应商资料分析专家。请详细分析这份产品目录文件，在 summary 字段中给出 300-500 字的中文摘要。

摘要必须包含以下内容：
【公司/品牌概述】1-2句简介
【产品线总览】共有多少个产品/系列，涵盖哪些品类
【重点产品】列出所有产品名称和简要描述
【技术/成分亮点】特色技术、成分、工艺
【价格信息】如果有提及
【包装/规格信息】
【适用市场和目标人群】
【对跨境电商卖家的价值评估】

请用【】标注各部分标题。同时在 products 数组中提取每个产品的结构化信息。
Return ONLY valid JSON, no markdown. JSON: {summary, products:[{name, specs, highlights}]}.`,

  PRICE_LIST: `你是供应商资料分析专家。请详细分析这份价格表文件，在 summary 字段中给出 300-500 字的中文摘要。

摘要必须包含以下内容：
【价格总览】产品数量、价格区间
【重点产品及价格】列出主要产品和对应价格
【MOQ 信息】最低起订量要求
【价格竞争力分析】与市场同类产品相比的价格优势
【批量折扣/阶梯价格】如有
【对跨境电商卖家的成本评估】

请用【】标注各部分标题。Mark competitive:true for unusually good value vs peers if inferable.
Return ONLY valid JSON, no markdown. JSON: {summary, items:[{skuOrName, price, moq, note, competitive}]}.`,

  TEST_REPORT: `你是供应商资料分析专家。请详细分析这份测试报告，在 summary 字段中给出 300-500 字的中文摘要。

摘要必须包含以下内容：
【报告概述】测试机构、测试日期、测试标准
【测试项目及结果】逐项列出测试项和结果
【合规性评估】是否符合亚马逊美国站销售要求
【认证/标准达标情况】FDA、CPSC、ASTM 等
【风险提示】不合格项或需关注的项目
【对跨境电商卖家的合规建议】

请用【】标注各部分标题。
Return ONLY valid JSON, no markdown. JSON: {summary, tests:[{name, result, pass}], amazonCompliance:{ok, notes}}.`,

  CERTIFICATION: `你是供应商资料分析专家。请详细分析这份证书文件，在 summary 字段中给出 300-500 字的中文摘要。

摘要必须包含以下内容：
【证书类型】具体是什么认证
【签发机构】颁发机构名称和资质
【有效期限】签发日期和到期日期
【认证范围】覆盖的产品或服务范围
【证书等级/标准】具体执行的标准编号
【对跨境电商卖家的价值】该证书对亚马逊等平台销售的意义

请用【】标注各部分标题。expiryDate as ISO date YYYY-MM-DD or null.
Return ONLY valid JSON, no markdown. JSON: {summary, certType, expiryDate, issuer}.`,
};

const DEFAULT_PROMPT = `你是供应商资料分析专家。请详细分析这份供应商文件，在 summary 字段中给出 300-500 字的中文摘要。

根据文件类型灵活调整内容，可能包含：
【文件概述】文件的基本信息和用途
【核心内容】文件中最重要的信息点
【关键数据】涉及的产品、价格、条款等具体数据
【对跨境电商卖家的参考价值】

请用【】标注各部分标题。不要只给一句话概括。
Return ONLY valid JSON, no markdown. JSON: {summary, details}.`;

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

  const systemPrompt = CATEGORY_PROMPTS[f.category] || DEFAULT_PROMPT;
  const isPdf = f.mimeType.toLowerCase() === "application/pdf";

  let structured: Record<string, unknown> | null = null;

  if (isPdf) {
    // PDF: use Claude native PDF support — send base64 directly
    const abs = absolutePathFromRelative(f.relativePath);
    let buf: Buffer | null = null;

    if (existsSync(abs)) {
      buf = await readFile(abs);
    } else if (f.fileData) {
      buf = Buffer.from(f.fileData);
    }

    if (!buf) {
      return NextResponse.json(
        { message: "文件需要重新上传（本地文件已丢失且数据库中无备份）" },
        { status: 404 }
      );
    }

    console.log("[ANALYZE] Using Claude native PDF, file:", f.originalName, "size:", buf.length);

    try {
      const base64 = buf.toString("base64");
      structured = await callClaudeWithPdfJson(
        base64,
        systemPrompt,
        `请分析这个文件: ${f.originalName}`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[ANALYZE] Claude PDF call failed:", msg);
      return NextResponse.json({ error: `AI 调用失败: ${msg}` }, { status: 500 });
    }
  } else {
    // Non-PDF: extract text and send as text
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

    console.log("[ANALYZE] Using text extraction, file:", f.originalName, "text length:", text.length);

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
          messages: [{ role: "user", content: `Document: ${f.originalName}\n\n${text.slice(0, 45_000)}` }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("[ANALYZE] API error:", response.status, errText.slice(0, 500));
        return NextResponse.json({ error: `AI 调用失败: ${response.status}` }, { status: 500 });
      }

      const data = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const rawText = data.content?.filter((b) => b.type === "text").map((b) => b.text ?? "").join("") || "";
      console.log("[ANALYZE] AI raw response (first 500 chars):", rawText.slice(0, 500));
      structured = extractJson(rawText);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[ANALYZE] API call failed:", msg);
      return NextResponse.json({ error: `AI 调用失败: ${msg}` }, { status: 500 });
    }
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
    const ac = structured.amazonCompliance as { ok: boolean; notes: string } | null;
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
