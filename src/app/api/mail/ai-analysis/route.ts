import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { prisma } from "@/lib/prisma";
import { claudeMessages } from "@/lib/claude-client";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const createSchema = z.object({
  query: z.string().min(1).max(10_000),
  emailId: z.string().optional(),
  supplierId: z.string().optional(),
  productName: z.string().optional(),
  fetchMarketData: z.boolean().optional(),
});

const SYSTEM_PROMPT = `你是一位专业的亚马逊跨境电商产品分析师。用户会向你提出产品相关问题，你需要根据提供的上下文（邮件内容、供应商信息等）给出专业分析。

你的分析应覆盖（按相关性选择）：
- 产品成分/材质安全性分析
- 市场竞争格局判断
- 价格竞争力评估
- 合规性风险（FDA、EU 法规等）
- 利润空间预估
- 推荐等级和综合评分

请用中文回复。如果能给出评分，请在回复末尾附上一个 JSON 块：
\`\`\`json
{"score": 75, "recommendation": "yes", "productName": "产品名称"}
\`\`\`
score 为 1-100 整数，recommendation 为 strong_yes / yes / maybe / no / strong_no 之一。
如果信息不足以评分，可以不附 JSON 块。`;

/** POST - 创建分析 */
export async function POST(req: Request) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ message: "无效 JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "参数错误", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { query, emailId, supplierId, productName, fetchMarketData } = parsed.data;

  // Build context from email if provided
  let emailContext = "";
  if (emailId) {
    const email = await prisma.email.findUnique({
      where: { id: emailId },
      select: {
        subject: true,
        fromAddress: true,
        bodyText: true,
        bodyZh: true,
        summaryCn: true,
        supplier: { select: { name: true, country: true } },
      },
    });
    if (email) {
      emailContext = [
        `\n--- 关联邮件 ---`,
        `主题: ${email.subject}`,
        `发件人: ${email.fromAddress}`,
        email.supplier ? `供应商: ${email.supplier.name} (${email.supplier.country})` : "",
        `内容:\n${email.bodyZh || email.bodyText || email.summaryCn || "（无内容）"}`,
        `--- 邮件结束 ---\n`,
      ].filter(Boolean).join("\n");
    }
  }

  // Create analysis record
  const analysis = await prisma.productAnalysis.create({
    data: {
      emailId: emailId || null,
      supplierId: supplierId || null,
      createdById: session.user.id,
      productName: productName || "",
      query,
      status: "analyzing",
    },
  });

  try {
    // Call Claude
    const userMessage = `${emailContext}\n用户问题: ${query}`;
    const aiResult = await claudeMessages({
      system: SYSTEM_PROMPT,
      user: userMessage,
      maxTokens: 4096,
    });

    if (!aiResult) {
      await prisma.productAnalysis.update({
        where: { id: analysis.id },
        data: { status: "failed" },
      });
      return NextResponse.json({ message: "AI 分析失败" }, { status: 503 });
    }

    // Extract score/recommendation from JSON block if present
    let score: number | null = null;
    let recommendation: string | null = null;
    let extractedProductName: string | null = null;
    const jsonMatch = aiResult.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch?.[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim()) as {
          score?: number;
          recommendation?: string;
          productName?: string;
        };
        if (typeof parsed.score === "number") score = parsed.score;
        if (typeof parsed.recommendation === "string") recommendation = parsed.recommendation;
        if (typeof parsed.productName === "string") extractedProductName = parsed.productName;
      } catch {
        // ignore parse errors
      }
    }

    // Optionally fetch market data via seller sprite MCP
    let marketData: string | null = null;
    if (fetchMarketData && extractedProductName) {
      try {
        // Use keyword_research from seller sprite MCP if available
        const keyword = extractedProductName;
        const mcpRes = await fetch(`${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/mcp/seller-sprite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool: "keyword_research", args: { keyword, marketplace: "US" } }),
        }).catch(() => null);
        if (mcpRes?.ok) {
          marketData = await mcpRes.text();
        }
      } catch {
        // MCP not available, skip
      }
    }

    // Update analysis
    const updated = await prisma.productAnalysis.update({
      where: { id: analysis.id },
      data: {
        analysisResult: aiResult,
        marketData,
        score,
        recommendation,
        productName: extractedProductName || productName || "",
        status: "completed",
      },
    });

    // Save initial chat messages
    await prisma.analysisChat.createMany({
      data: [
        { analysisId: analysis.id, role: "user", content: query },
        { analysisId: analysis.id, role: "assistant", content: aiResult },
      ],
    });

    return NextResponse.json({
      ok: true,
      analysis: updated,
    });
  } catch (e) {
    await prisma.productAnalysis.update({
      where: { id: analysis.id },
      data: { status: "failed", analysisResult: e instanceof Error ? e.message : String(e) },
    });
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "分析失败" },
      { status: 500 }
    );
  }
}

/** GET - 分析列表 */
export async function GET(req: Request) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const url = new URL(req.url);
  const supplierId = url.searchParams.get("supplierId");

  const where: Record<string, unknown> = { createdById: session.user.id };
  if (supplierId) where.supplierId = supplierId;

  const items = await prisma.productAnalysis.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      productName: true,
      query: true,
      score: true,
      recommendation: true,
      status: true,
      emailId: true,
      supplierId: true,
      createdAt: true,
      email: { select: { subject: true } },
      supplier: { select: { name: true } },
    },
  });

  return NextResponse.json({ items });
}
