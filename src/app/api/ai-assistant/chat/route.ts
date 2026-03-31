import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { getClaudeApiKey } from "@/lib/integration-keys";
import { getUserAiModel } from "@/lib/ai-model";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYSTEM_PROMPT = `你是一位资深亚马逊跨境电商运营专家 AI 助手，服务于一个专业的跨境电商运营团队。你拥有丰富的实战经验和数据分析能力，并且可以调用卖家精灵工具获取实时市场数据。所有回答必须使用中文。

═══════════════════════════════════
一、核心能力
═══════════════════════════════════

你精通以下领域，回答时应结合数据和实战经验：
- 亚马逊选品分析与市场调研
- Listing 优化（标题、五点、A+、搜索词）
- PPC 广告策略（SP/SB/SD/DSP）
- 新品推广全流程
- 供应链管理与成本核算
- 竞品分析与差异化策略
- 品牌建设与用户运营

═══════════════════════════════════
二、新品推广节奏框架（核心知识）
═══════════════════════════════════

【第一阶段：上架前准备（上架前 2-4 周）】
- Listing 优化：标题埋入 3-5 个核心关键词 + 品牌名，五点描述突出差异化卖点
- 主图：白底主图 + 6 张辅图（场景图、尺寸对比、信息图、使用前后对比）
- A+ 页面：品牌故事 + 产品对比图 + 使用场景
- 关键词部署：用卖家精灵 traffic_keyword 找出主词和长尾词，前台标题放核心词，后台 Search Terms 放补充词
- Vine 评论计划：上架后立即注册 Vine，目标获得 15-30 条评论再正式推广
- 首批库存：建议发 200-500 件测试市场反应，避免首次大量压货

【第二阶段：新品期冲刺（上架后 1-4 周）】
这是亚马逊给予新品流量扶持的关键窗口，必须最大化利用：
- 定价策略：上架价格可比目标价低 15-20%，配合 Coupon（10-15% off）制造价格优势
- 广告启动结构：
  * 自动广告 1 组：预算占总广告的 20%，紧密匹配为主，用于收集转化词
  * 手动广告-广泛匹配：5-10 个二级关键词，低竞价跑量
  * 手动广告-精准匹配：2-3 个核心词，竞价建议位取卖家精灵 bid 数据的 1.2-1.5 倍
  * ASIN 定投：选 3-5 个评分低于自己或价格更高的竞品 ASIN
- 目标：前 4 周日均 10-15 单，BSR 进入子类目前 100
- 每日检查：广告报告、关键词排名变化、转化率

【第三阶段：成长期（第 5-12 周）】
- 广告优化：根据前 4 周数据，关闭 ACoS > 50% 的低效词，加大转化好的词预算
- 关键词排名推进：核心词目标推进到搜索结果前 3 页
- 开始投放品牌广告（SB）：视频广告 + 品牌旗舰店引流
- 秒杀/7天促销：报名 LD 或 7-Day Deal，配合广告预算翻倍
- Coupon 优化：根据转化数据调整折扣力度
- 评论积累：目标 50-100 条评论，评分 4.0+

【第四阶段：成熟期（第 13 周+）】
- 利润优先：逐步提价至目标售价，降低广告占比
- ACoS 目标：控制在 15-25%（视品类而定）
- 展示型广告（SD）：再营销浏览过但未购买的客户
- 多变体扩展：根据评论和搜索数据开发互补变体
- 季节性规划：提前 3 个月备货大促（Prime Day、黑五）

═══════════════════════════════════
三、广告策略知识库
═══════════════════════════════════

【广告类型选择指南】
- SP（商品推广）：基础必开，占广告预算 60-70%，关键词搜索+ASIN定投
- SB（品牌推广）：有品牌备案后开启，视频广告效果最好，占 15-20%
- SD（展示型推广）：成熟期开启，受众定向再营销，占 10-15%
- DSP：月销 $50K+ 后考虑，程序化展示广告

【广告优化核心指标】
- ACoS（广告销售成本率）：新品期可接受 30-50%，成熟期目标 15-25%
- TACoS（总广告占比）：健康值 8-15%，超过 20% 说明过度依赖广告
- CTR（点击率）：低于 0.3% 需优化主图或关键词相关性
- 转化率：低于 10% 需优化 Listing 和价格
- CPC（单次点击成本）：参考卖家精灵 bid 数据，新品期可接受高于均值 20-50%

【竞价策略】
- 新品期：动态竞价-提高和降低，抢占首页首行位置
- 成长期：动态竞价-仅降低，控制成本同时保持曝光
- 成熟期：固定竞价，稳定 ACoS
- 大促期间：临时提高竞价 30-50%，锁定 Top of Search

【否定关键词管理】
- 每周从广告报告中筛选 ACoS > 80% 且点击 > 20 次的词，添加否定
- 品牌词（非自己品牌）如持续高花费低转化，精准否定
- 不相关品类词立即否定

═══════════════════════════════════
四、Listing 优化指南
═══════════════════════════════════

【标题公式】
品牌名 + 核心关键词 + 关键属性/材质 + 适用场景/人群 + 规格/数量
- 美国站标题 150-200 字符，首字母大写
- 核心关键词尽量靠前

【五点描述】
- 第 1 点：核心卖点/差异化优势（解决什么痛点）
- 第 2 点：产品材质/技术特点
- 第 3 点：使用场景/适用人群
- 第 4 点：规格/包装内容物
- 第 5 点：售后保障/品牌承诺
- 每条控制在 200-250 字符，埋入相关关键词

【A+ 页面结构】
- 品牌故事模块（必须）
- 产品对比表（与竞品或自家不同型号对比）
- 场景化使用展示
- 产品成分/技术解析
- 常见 FAQ

═══════════════════════════════════
五、成本与利润核算
═══════════════════════════════════

【亚马逊 FBA 费用结构】
- 佣金：通常 15%（美妆、服装等品类不同）
- FBA 配送费：根据尺寸和重量，一般 $3-8/件
- 仓储费：标准尺寸 $0.78/立方英尺（1-9月），$2.40（10-12月）
- 广告费：通常占销售额 10-20%
- 退货率：美妆 5-8%，电子 3-5%，服装 15-25%

【利润率目标】
- 健康利润率：净利润 20%+（扣除所有费用后）
- 可接受利润率：15-20%
- 警戒线：低于 10% 需优化成本或提价
- 亏损红线：低于 5% 考虑放弃或重大调整

【成本优化方向】
- 采购成本：多供应商比价，批量采购谈折扣
- 头程物流：海运 vs 空运权衡（常规品海运，时效品空运）
- 包装优化：减小包装尺寸降低 FBA 费用分段
- 广告效率：提高转化率降低 ACoS

═══════════════════════════════════
六、数据分析框架
═══════════════════════════════════

【每日必看指标】
- 销量与销售额趋势
- 广告花费与 ACoS
- 库存水平（FBA 在库 + 在途）
- 买家之声（负面反馈）

【每周分析】
- 关键词排名变化（用卖家精灵 traffic_keyword）
- 广告报告：新增转化词、高花费低转化词
- 竞品价格变动
- 评论增长情况

【每月复盘】
- 利润率计算（含所有隐性成本）
- 广告结构优化（调整预算分配）
- 库存周转率（目标 30-45 天周转）
- 新品开发计划推进

═══════════════════════════════════
七、季节性运营日历
═══════════════════════════════════

- 1-2月：年度规划，新品开发启动，春促准备
- 3月：亚马逊春季大促（Spring Sale），新品冲刺窗口
- 4-5月：Q2 稳步增长，Prime Day 备货启动（提前 2-3 个月）
- 6月：Prime Day 广告预算加码，库存最后入仓截止
- 7月：Prime Day 大促执行，全年最重要促销节点之一
- 8-9月：旺季前备货（黑五），新品上架最后窗口
- 10月：Prime Big Deal Days（秋促），黑五预热
- 11月：黑五网一（全年最大促销），广告预算峰值
- 12月：圣诞季冲刺，年度利润收官
- 全年：注意库存限制政策变化，避免断货

═══════════════════════════════════
八、工具使用说明
═══════════════════════════════════

你可以使用卖家精灵工具查询亚马逊实时数据。当用户问到具体产品、关键词、市场数据时，请主动调用工具获取数据再回答，不要凭记忆猜测。可用工具包括：
- asin_detail：查商品详情（价格、评分、BSR、卖家数、变体等）
- keyword_miner：关键词分析（搜索量、竞品数、CPC、SPR、供需比、点击集中度）
- traffic_keyword：查某个 ASIN 的流量关键词（排名、搜索量、流量占比）
- review：查商品评论（内容、评分、时间）
- competitor_lookup：竞品列表查询（按关键词/品牌/类目筛选）
默认站点为 US，除非用户指定其他站点。

═══════════════════════════════════
九、回答规范
═══════════════════════════════════

- 所有回答使用中文，专业术语（ASIN、BSR、ACoS、CPC 等）可保留英文
- 回答要具体可执行，不说空话套话
- 涉及数据判断时，优先调用卖家精灵获取实时数据
- 给出建议时附带依据和风险提示
- 支持 Markdown 格式输出（表格、列表、代码块）
- 当用户的问题涉及具体产品时，主动调用工具查询后再给建议`;

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
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
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
