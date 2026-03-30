import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { getClaudeApiKey } from "@/lib/integration-keys";
import { getUserAiModel } from "@/lib/ai-model";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYSTEM_PROMPT = `你是一位专业的AI助手，服务于跨境电商运营团队。你精通：
- 亚马逊运营策略、选品分析、Listing优化
- 供应链管理、物流方案、成本核算
- 市场趋势分析、竞品研究
- 数据分析与商业决策

请用中文回答，语言简洁专业。如果用户的问题不涉及跨境电商，你也可以正常回答其他问题。
支持 Markdown 格式输出，包括表格、代码块、列表等。`;

export async function POST(req: NextRequest) {
  const { session, error } = await requireModuleAccess("ai-assistant");
  if (error) return error;

  const apiKey = await getClaudeApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { message: "未配置 Claude API Key，请前往设置页面配置" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const { conversationId, message, fileUrl, fileName } = body as {
    conversationId: string;
    message: string;
    fileUrl?: string;
    fileName?: string;
  };

  if (!conversationId || !message?.trim()) {
    return NextResponse.json({ message: "参数缺失" }, { status: 400 });
  }

  const conversation = await prisma.aiConversation.findFirst({
    where: { id: conversationId, userId: session!.user.id },
  });
  if (!conversation) {
    return NextResponse.json({ message: "会话不存在" }, { status: 404 });
  }

  // Use the per-user assigned AI model
  const claudeModel = await getUserAiModel(session!.user.id);

  // Save user message
  await prisma.aiMessage.create({
    data: {
      conversationId,
      role: "user",
      content: message,
      fileUrl: fileUrl || null,
      fileName: fileName || null,
    },
  });

  // Load conversation history (last 50 messages)
  const history = await prisma.aiMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { role: true, content: true },
  });

  const messages = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Auto-title on first user message
  const isFirstMessage = history.filter((m) => m.role === "user").length === 1;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let fullText = "";

      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: claudeModel,
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            messages,
            stream: true,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: "error", message: `API 错误 (${response.status}): ${errText}` }) + "\n"
            )
          );
          controller.close();
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "error", message: "无法读取响应流" }) + "\n")
          );
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const evt = JSON.parse(data);
              if (
                evt.type === "content_block_delta" &&
                evt.delta?.type === "text_delta"
              ) {
                const text = evt.delta.text;
                fullText += text;
                controller.enqueue(
                  encoder.encode(JSON.stringify({ type: "delta", text }) + "\n")
                );
              }
            } catch {
              // skip non-JSON lines
            }
          }
        }

        // Save assistant message
        const assistantMsg = await prisma.aiMessage.create({
          data: {
            conversationId,
            role: "assistant",
            content: fullText,
            model: claudeModel,
          },
        });

        // Auto-generate title from first message
        if (isFirstMessage && message.length > 0) {
          const title =
            message.length <= 20
              ? message
              : message.slice(0, 20) + "...";
          await prisma.aiConversation.update({
            where: { id: conversationId },
            data: { title },
          });
        }

        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "done", messageId: assistantMsg.id }) + "\n"
          )
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "error", message: errMsg }) + "\n")
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
