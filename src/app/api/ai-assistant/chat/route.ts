import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { getClaudeApiKey } from "@/lib/integration-keys";
import { getUserAiModel } from "@/lib/ai-model";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYSTEM_PROMPT = `你是一位专业的AI助手，服务于跨境电商运营团队。你精通：
- 亚马逊运营策略、选品分析、Listing优化
- 供应链管理、物流方案、成本核算
- 市场趋势分析、竞品研究
- 数据分析与商业决策

请用中文回答，语言简洁专业。如果用户的问题不涉及跨境电商，你也可以正常回答其他问题。
支持 Markdown 格式输出，包括表格、代码块、列表等。

你可以使用卖家精灵工具查询亚马逊实时数据。当用户问到具体产品、关键词、市场数据时，请主动调用工具获取数据再回答，不要凭记忆猜测。可用工具包括：
- asin_detail：查商品详情（价格、评分、BSR、卖家等）
- keyword_miner：关键词分析（搜索量、竞品数、CPC、SPR）
- traffic_keyword：ASIN 流量关键词
- review：商品评论
- competitor_lookup：竞品列表
默认站点为 US，除非用户指定其他站点。`;

const MARKETPLACE_ENUM = ["US", "JP", "UK", "DE", "FR", "IT", "ES", "CA"];

const TOOLS = [
  {
    name: "asin_detail",
    description:
      "查询 Amazon 单个商品(ASIN)的完整详情：价格、评分、评论数、BSR、品牌、变体、卖家等",
    input_schema: {
      type: "object" as const,
      properties: {
        asin: { type: "string", description: "Amazon ASIN 编码" },
        marketplace: {
          type: "string",
          enum: MARKETPLACE_ENUM,
          description: "站点",
        },
      },
      required: ["asin", "marketplace"],
    },
  },
  {
    name: "keyword_miner",
    description:
      "关键词挖掘：查询搜索量、竞品数、SPR、CPC竞价、点击集中度、供需比等数据",
    input_schema: {
      type: "object" as const,
      properties: {
        keyword: { type: "string", description: "要查询的关键词" },
        marketplace: {
          type: "string",
          enum: MARKETPLACE_ENUM,
          description: "站点",
        },
      },
      required: ["keyword", "marketplace"],
    },
  },
  {
    name: "traffic_keyword",
    description:
      "查询某个 ASIN 的流量关键词列表：搜索量、排名、CPC、流量占比",
    input_schema: {
      type: "object" as const,
      properties: {
        asin: { type: "string", description: "ASIN" },
        marketplace: {
          type: "string",
          enum: MARKETPLACE_ENUM,
          description: "站点",
        },
      },
      required: ["asin", "marketplace"],
    },
  },
  {
    name: "review",
    description: "查询某个 ASIN 的用户评论列表：评论内容、评分、时间",
    input_schema: {
      type: "object" as const,
      properties: {
        asin: { type: "string", description: "ASIN" },
        marketplace: {
          type: "string",
          enum: MARKETPLACE_ENUM,
          description: "站点",
        },
      },
      required: ["asin", "marketplace"],
    },
  },
  {
    name: "competitor_lookup",
    description:
      "查询竞品列表：按关键词、品牌、类目筛选商品，返回销量、价格、评分等",
    input_schema: {
      type: "object" as const,
      properties: {
        keyword: { type: "string", description: "搜索关键词" },
        marketplace: {
          type: "string",
          enum: MARKETPLACE_ENUM,
          description: "站点",
        },
      },
      required: ["marketplace"],
    },
  },
];

/** Tools that need nested { request: { ... } } format for MCP */
const NESTED_REQUEST_TOOLS = new Set([
  "keyword_miner",
  "traffic_keyword",
  "competitor_lookup",
]);

function buildMcpArgs(
  toolName: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  if (NESTED_REQUEST_TOOLS.has(toolName)) {
    return { request: input };
  }
  return input;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type ApiMessage = {
  role: "user" | "assistant";
  content: string | ContentBlock[];
};

const TOOL_LABEL: Record<string, string> = {
  asin_detail: "商品详情",
  keyword_miner: "关键词分析",
  traffic_keyword: "流量关键词",
  review: "商品评论",
  competitor_lookup: "竞品列表",
};

export async function POST(req: NextRequest) {
  const { session, error } = await requireModuleAccess("ai-assistant");
  if (error) return error;

  const apiKey = await getClaudeApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { message: "未配置 Claude API Key，请前往设置页面配置" },
      { status: 400 },
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

  const apiMessages: ApiMessage[] = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const isFirstMessage = history.filter((m) => m.role === "user").length === 1;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let fullText = "";

      function send(obj: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      }

      try {
        const mcp = createSellerspriteMcpClient();
        let loopMessages = [...apiMessages];
        let loopCount = 0;
        const MAX_TOOL_LOOPS = 5;

        // Tool-use loop: call Claude, execute tools if needed, repeat
        while (loopCount < MAX_TOOL_LOOPS) {
          loopCount++;

          const response = await fetch(
            "https://api.anthropic.com/v1/messages",
            {
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
                messages: loopMessages,
                tools: TOOLS,
                stream: true,
              }),
            },
          );

          if (!response.ok) {
            const errText = await response.text();
            send({
              type: "error",
              message: `API 错误 (${response.status}): ${errText}`,
            });
            controller.close();
            return;
          }

          const reader = response.body?.getReader();
          if (!reader) {
            send({ type: "error", message: "无法读取响应流" });
            controller.close();
            return;
          }

          // Parse streaming response
          const decoder = new TextDecoder();
          let buf = "";
          let stopReason: string | null = null;

          const contentBlocks: ContentBlock[] = [];
          let curIdx = -1;
          let toolInputJson = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const raw = line.slice(6).trim();
              if (raw === "[DONE]") continue;

              try {
                const evt = JSON.parse(raw);

                if (evt.type === "content_block_start") {
                  curIdx = evt.index ?? contentBlocks.length;
                  const cb = evt.content_block;
                  if (cb?.type === "text") {
                    contentBlocks[curIdx] = { type: "text", text: cb.text || "" };
                  } else if (cb?.type === "tool_use") {
                    contentBlocks[curIdx] = {
                      type: "tool_use",
                      id: cb.id,
                      name: cb.name,
                      input: {},
                    };
                    toolInputJson = "";
                    send({
                      type: "tool_call",
                      tool: cb.name,
                      label: TOOL_LABEL[cb.name] || cb.name,
                      status: "calling",
                    });
                  }
                } else if (evt.type === "content_block_delta") {
                  const idx = evt.index ?? curIdx;
                  const block = contentBlocks[idx];
                  if (evt.delta?.type === "text_delta" && block?.type === "text") {
                    const text = evt.delta.text;
                    block.text += text;
                    fullText += text;
                    send({ type: "delta", text });
                  } else if (
                    evt.delta?.type === "input_json_delta" &&
                    block?.type === "tool_use"
                  ) {
                    toolInputJson += evt.delta.partial_json ?? "";
                  }
                } else if (evt.type === "content_block_stop") {
                  const idx = evt.index ?? curIdx;
                  const block = contentBlocks[idx];
                  if (block?.type === "tool_use" && toolInputJson) {
                    try {
                      block.input = JSON.parse(toolInputJson);
                    } catch {
                      block.input = {};
                    }
                    toolInputJson = "";
                  }
                } else if (evt.type === "message_delta") {
                  if (evt.delta?.stop_reason) {
                    stopReason = evt.delta.stop_reason;
                  }
                }
              } catch {
                // skip
              }
            }
          }

          // If Claude wants to use tools, execute them and loop
          if (stopReason === "tool_use") {
            const assistantContent: ContentBlock[] = contentBlocks
              .filter(Boolean)
              .map((b) => {
                if (b.type === "text") return { type: "text" as const, text: b.text };
                return {
                  type: "tool_use" as const,
                  id: (b as { id: string }).id,
                  name: (b as { name: string }).name,
                  input: (b as { input: Record<string, unknown> }).input,
                };
              });

            loopMessages = [
              ...loopMessages,
              { role: "assistant" as const, content: assistantContent },
            ];

            // Execute each tool call
            const toolResults: ContentBlock[] = [];
            for (const block of assistantContent) {
              if (block.type !== "tool_use") continue;

              send({
                type: "tool_call",
                tool: block.name,
                label: TOOL_LABEL[block.name] || block.name,
                status: "executing",
              });

              const mcpArgs = buildMcpArgs(block.name, block.input);
              const result = await mcp.callToolSafe(block.name, mcpArgs);

              let resultText: string;
              if (result.ok) {
                resultText =
                  typeof result.data === "string"
                    ? result.data
                    : JSON.stringify(result.data, null, 2);
                if (resultText.length > 15000) {
                  resultText =
                    resultText.slice(0, 15000) + "\n...(数据已截断)";
                }
              } else {
                resultText = `工具调用失败: ${result.error}`;
              }

              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: resultText,
              });

              send({
                type: "tool_call",
                tool: block.name,
                label: TOOL_LABEL[block.name] || block.name,
                status: "done",
              });
            }

            loopMessages = [
              ...loopMessages,
              { role: "user" as const, content: toolResults },
            ];
            continue;
          }

          // end_turn — done
          break;
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

        // Auto-generate title
        if (isFirstMessage && message.length > 0) {
          const title =
            message.length <= 20 ? message : message.slice(0, 20) + "...";
          await prisma.aiConversation.update({
            where: { id: conversationId },
            data: { title },
          });
        }

        send({ type: "done", messageId: assistantMsg.id });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: errMsg });
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
