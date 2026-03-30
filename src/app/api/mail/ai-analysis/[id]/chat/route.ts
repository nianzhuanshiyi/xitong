import { NextResponse } from "next/server";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getClaudeApiKey } from "@/lib/integration-keys";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const chatSchema = z.object({
  message: z.string().min(1).max(10_000),
});

const SYSTEM_PROMPT = `你是一位专业的亚马逊跨境电商产品分析师。用户正在与你进行多轮对话讨论产品分析。请基于之前的对话上下文继续回答。用中文回复。

如果用户的追问让你能给出更准确的评分，可在回复末尾附上 JSON 块：
\`\`\`json
{"score": 75, "recommendation": "yes"}
\`\`\``;

/** POST - 追问对话 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { session, error } = await requireModuleAccess("email");
  if (error) return error;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ message: "无效 JSON" }, { status: 400 });
  }

  const parsed = chatSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "参数错误", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const analysis = await prisma.productAnalysis.findUnique({
    where: { id: params.id },
    include: {
      chats: { orderBy: { createdAt: "asc" } },
      email: { select: { subject: true, bodyZh: true, bodyText: true, summaryCn: true } },
    },
  });

  if (!analysis) {
    return NextResponse.json({ message: "未找到" }, { status: 404 });
  }

  if (analysis.createdById !== session!.user.id) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  // Build messages array for multi-turn
  const messages: { role: "user" | "assistant"; content: string }[] = [];

  // Add email context as first user message context
  if (analysis.email) {
    const emailCtx = `[关联邮件] 主题: ${analysis.email.subject}\n内容: ${analysis.email.bodyZh || analysis.email.bodyText || analysis.email.summaryCn || ""}`;
    messages.push({ role: "user", content: `${emailCtx}\n\n${analysis.query}` });
  } else {
    messages.push({ role: "user", content: analysis.query });
  }

  // Add chat history (skip first user+assistant which are initial query+response)
  for (let i = 2; i < analysis.chats.length; i++) {
    const c = analysis.chats[i];
    messages.push({
      role: c.role as "user" | "assistant",
      content: c.content,
    });
  }

  // Add first assistant response
  if (analysis.chats.length >= 2) {
    // Reorder: first pair is initial, rest are follow-ups
    const ordered: { role: "user" | "assistant"; content: string }[] = [];
    for (const c of analysis.chats) {
      ordered.push({ role: c.role as "user" | "assistant", content: c.content });
    }
    messages.length = 0;
    messages.push(...ordered);
  }

  // Add new user message
  messages.push({ role: "user", content: parsed.data.message });

  // Call Claude with full conversation
  const key = await getClaudeApiKey();
  if (!key) {
    return NextResponse.json({ message: "未配置 Claude API 密钥" }, { status: 503 });
  }

  const model = process.env.CLAUDE_ANALYSIS_MODEL?.trim() || "claude-opus-4-6";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return NextResponse.json(
      { message: `Claude API 错误: ${errText.slice(0, 200)}` },
      { status: 502 }
    );
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const aiText = data.content?.find((c) => c.type === "text")?.text ?? "";

  if (!aiText) {
    return NextResponse.json({ message: "AI 无回复" }, { status: 503 });
  }

  // Save chat messages
  await prisma.analysisChat.createMany({
    data: [
      { analysisId: analysis.id, role: "user", content: parsed.data.message },
      { analysisId: analysis.id, role: "assistant", content: aiText },
    ],
  });

  // Update score/recommendation if AI provided new ones
  const jsonMatch = aiText.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch?.[1]) {
    try {
      const j = JSON.parse(jsonMatch[1].trim()) as {
        score?: number;
        recommendation?: string;
      };
      const updateData: Record<string, unknown> = {};
      if (typeof j.score === "number") updateData.score = j.score;
      if (typeof j.recommendation === "string") updateData.recommendation = j.recommendation;
      if (Object.keys(updateData).length > 0) {
        await prisma.productAnalysis.update({
          where: { id: analysis.id },
          data: updateData,
        });
      }
    } catch {
      // ignore
    }
  }

  return NextResponse.json({
    ok: true,
    message: aiText,
  });
}
