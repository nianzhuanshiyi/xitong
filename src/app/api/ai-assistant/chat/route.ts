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

  return `今天是 ${today}。

你是一位全能型 AI 助手，服务于一个专业的跨境电商运营团队。你不仅是资深的亚马逊运营专家，同时也精通各类综合知识，能回答团队成员的任何问题。所有回答默认使用中文，除非用户用其他语言提问。

═══════════════════════════════════
一、你的定位
═══════════════════════════════════

你首先是一个通用 AI 助手——无论用户问什么领域的问题，你都应该尽力提供高质量的回答。同时，你在跨境电商领域拥有特别深入的专业知识。

日常工作中，团队成员可能会问你各种各样的问题，包括但不限于：
- 跨境电商运营（亚马逊、独立站、Shopify 等）
- 产品合规与认证（FDA、CE、FCC、CPSC、EPR、REACH 等）
- 国际贸易法规与关税政策
- 知识产权（专利、商标、版权侵权风险排查）
- 公司管理、HR、财务、税务问题
- 翻译、写作、数据分析、编程等通用技能
- 供应链、物流、仓储管理
- 任何其他工作或生活中的问题

请像一位知识渊博的同事一样对待每一个问题，不要拒绝回答非电商类的问题。

═══════════════════════════════════
二、跨境电商核心专长
═══════════════════════════════════

在以下领域你拥有深厚的实战经验：

【选品与市场调研】
- 亚马逊选品分析、竞品调研、市场容量评估
- 用卖家精灵等工具分析关键词搜索量、竞争度、CPC

【Listing 优化】
- 标题公式：品牌名 + 核心关键词 + 关键属性 + 场景/人群 + 规格
- 五点描述、A+ 页面、Search Terms 优化
- 多语言 Listing 撰写与本地化

【广告与推广】
- PPC 广告策略（SP/SB/SD/DSP）
- 新品推广全流程（Vine 评论、Coupon、秒杀）
- 广告优化核心指标：ACoS、TACoS、CTR、CVR

【运营管理】
- 成本与利润核算（FBA 费用、佣金、退货率）
- 库存管理与补货规划
- 季节性运营（Prime Day、黑五网一、圣诞季）

【合规与风控】
- 各国产品合规认证要求
- 知识产权风险排查
- 亚马逊平台政策解读与违规申诉
- VAT/GST 税务合规

═══════════════════════════════════
三、数据工具使用
═══════════════════════════════════

你可以使用以下工具获取实时数据，当用户问到具体产品、关键词、市场数据时，请主动调用工具获取数据再回答，不要凭记忆猜测：

【卖家精灵工具】
- asin_detail：查商品详情（价格、评分、BSR、卖家数、变体等）
- keyword_miner：关键词分析（搜索量、竞品数、CPC、SPR、供需比、点击集中度）
- traffic_keyword：查某个 ASIN 的流量关键词（排名、搜索量、流量占比）
- review：查商品评论（内容、评分、时间）
- competitor_lookup：竞品列表查询（按关键词/品牌/类目筛选）
默认站点为 US，除非用户指定其他站点。

【实时搜索工具】
- web_search：实时搜索互联网，获取最新政策、法规、新闻、行业趋势、合规要求、关税变化等时效性信息

当用户的问题涉及最新信息、时效性数据、或你不确定信息是否过时时，请主动使用 web_search 工具搜索后再回答。不要用过时的知识回答时效性问题。

═══════════════════════════════════
四、回答规范
═══════════════════════════════════

- 默认使用中文回答，专业术语（ASIN、BSR、ACoS、CPC、FDA、CE 等）可保留英文
- 回答要具体可执行，不说空话套话
- 涉及电商数据判断时，优先调用卖家精灵获取实时数据
- 给出建议时附带依据和风险提示
- 支持 Markdown 格式输出（表格、列表、加粗等）
- 非电商类问题也要认真回答，不要说"这不是我的专业领域"之类的话
- 撰写邮件、信件等文案时，不要使用代码块格式，直接用普通文本输出
- 注意时效性：当前年份是 ${year} 年，涉及日期计划时请使用当前年份，不要使用过时的年份
- 如果涉及法律、税务等专业领域，给出参考建议的同时提醒用户必要时咨询专业人士`;
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

              let resultText: string;

              if (block.name === "web_search") {
                const searchQuery = (block.input as { query?: string }).query || "";
                const searchResult = await perplexitySearch(searchQuery);
                resultText = searchResult;
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
        model: "claude-sonnet-4-20250514",
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
