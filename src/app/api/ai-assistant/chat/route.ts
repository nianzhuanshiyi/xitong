import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { getClaudeApiKey } from "@/lib/integration-keys";
import { getUserAiModel } from "@/lib/ai-model";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";
import { perplexitySearch } from "@/lib/perplexity";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function buildSystemPrompt() {
  const today = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "America/Los_Angeles",
  });
  const year = new Date().getFullYear();

  return `今天是 ${today}（当前年份 ${year}，涉及日期/计划请使用当前年份）。

你是服务于跨境电商运营团队的全能型 AI 助手，同时是资深亚马逊运营专家。默认用中文回答（除非用户用其他语言提问），像知识渊博的同事一样对待每个问题，不拒绝非电商类问题（HR、财务、翻译、编程等也认真回答）。

跨境电商专长：选品与竞品调研、Listing 优化（标题/五点/A+/Search Terms）、PPC 广告（SP/SB/SD/DSP，ACoS/TACoS/CTR/CVR）、运营管理（FBA 成本核算、库存补货、季节性大促）、合规与风控（FDA/CE/FCC/CPSC/EPR/REACH、知识产权、VAT/GST、平台政策申诉）。

工具使用：用户问到具体产品/关键词/市场数据时，主动调用下方工具获取实时数据，不要凭记忆猜测；卖家精灵工具默认站点 US，除非用户指定其他站点。涉及最新政策法规、新闻、行业趋势等时效性信息，或你不确定知识是否过时时，主动用 web_search 查证。

回答规范：
- 具体可执行，不说空话套话；给建议时附带依据和风险提示
- 专业术语（ASIN、BSR、ACoS、CPC、FDA、CE 等）可保留英文
- 支持 Markdown（表格、列表、加粗），但撰写邮件/信件等文案时用普通文本，不要代码块
- 涉及法律、税务等专业领域时，提醒用户必要时咨询专业人士`;
}

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
  {
    name: "web_search",
    description:
      "实时搜索互联网获取最新信息。用于查询最新政策法规、行业新闻、产品趋势、合规要求、关税变化、竞品动态等需要时效性的信息。当用户的问题涉及'最新'、'现在'、'目前'、'2025'、'2026'等时间相关内容，或你对信息的时效性不确定时，应主动使用此工具。",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "搜索查询词，尽量具体明确，使用英文搜索效果更好",
        },
      },
      required: ["query"],
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
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } }
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
  web_search: "互联网搜索",
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
  const { conversationId, message, fileUrl, fileName, fileType, fileContent, fileBase64 } = body as {
    conversationId: string;
    message: string;
    fileUrl?: string;
    fileName?: string;
    fileType?: string;
    fileContent?: string;
    fileBase64?: string;
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

  // If the latest user message has a file, inject it for Claude
  if (apiMessages.length > 0 && fileName) {
    const lastMsg = apiMessages[apiMessages.length - 1];
    if (lastMsg.role === "user") {
      const userText = typeof lastMsg.content === "string" ? lastMsg.content : "";

      if (fileBase64 && fileType === "application/pdf") {
        // PDF: use Claude native document support
        console.log("[CHAT] Injecting PDF document for:", fileName, "base64 length:", fileBase64.length);
        lastMsg.content = [
          {
            type: "document" as const,
            source: {
              type: "base64" as const,
              media_type: "application/pdf",
              data: fileBase64,
            },
          },
          { type: "text" as const, text: userText },
        ];
      } else if (fileContent && fileContent.trim()) {
        // Non-PDF with extracted text
        console.log("[CHAT] Injecting file text for:", fileName, "length:", fileContent.length);
        lastMsg.content = `[用户上传了文件: ${fileName}]\n=== 文件内容 ===\n${fileContent}\n=== 文件内容结束 ===\n\n用户的问题: ${userText}`;
      } else if (typeof lastMsg.content === "string") {
        lastMsg.content = `[用户上传了文件: ${fileName}，但未能提取文本内容]\n\n用户的问题: ${userText}`;
      }
    }
  }

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
                system: buildSystemPrompt(),
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

            // Execute all tool calls from this round in parallel (MCP calls
            // are independent of each other, so no need to serialize them).
            const toolUseBlocks = assistantContent.filter(
              (block): block is Extract<ContentBlock, { type: "tool_use" }> =>
                block.type === "tool_use",
            );

            const toolResults: ContentBlock[] = await Promise.all(
              toolUseBlocks.map(async (block) => {
                send({
                  type: "tool_call",
                  tool: block.name,
                  label: TOOL_LABEL[block.name] || block.name,
                  status: "executing",
                });

                let resultText: string;

                if (block.name === "web_search") {
                  const searchQuery = (block.input as { query?: string }).query || "";
                  resultText = await perplexitySearch(searchQuery);
                } else {
                  const mcpArgs = buildMcpArgs(block.name, block.input);
                  const result = await mcp.callToolSafe(block.name, mcpArgs);

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
                }

                send({
                  type: "tool_call",
                  tool: block.name,
                  label: TOOL_LABEL[block.name] || block.name,
                  status: "done",
                });

                return {
                  type: "tool_result" as const,
                  tool_use_id: block.id,
                  content: resultText,
                };
              }),
            );

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

        // Auto-generate title (async, non-blocking)
        if (isFirstMessage && message.length > 0) {
          generateTitle(conversationId, message, apiKey).catch(console.error);
        }

        await prisma.activityLog.create({
          data: {
            userId: session!.user.id,
            module: "ai-assistant",
            action: "chat",
            detail: JSON.stringify({ messagePreview: message.trim().slice(0, 50) }),
          },
        }).catch(() => {});

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
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

async function generateTitle(conversationId: string, firstMessage: string, apiKey: string) {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 50,
        messages: [
          {
            role: "user",
            content: `根据以下用户消息生成一个10字以内的中文对话标题，只返回标题文字，不要引号：\n${firstMessage.substring(0, 200)}`,
          },
        ],
      }),
    });
    const data = await response.json();
    const title = data.content?.[0]?.text?.trim() || firstMessage.substring(0, 20);
    await prisma.aiConversation.update({
      where: { id: conversationId },
      data: { title },
    });
  } catch (err) {
    // Fallback to simple truncation
    const title = firstMessage.length <= 20 ? firstMessage : firstMessage.slice(0, 20) + "...";
    await prisma.aiConversation.update({
      where: { id: conversationId },
      data: { title },
    }).catch(() => {});
    console.error("[generateTitle] failed:", err);
  }
}
