import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { claudeJson, getLastClaudeUsage } from "@/lib/claude-client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { session, error } = await requireModuleAccess("au-dev");
  if (error) return error;

  try {
    const { analysisId, diffIndex } = await req.json();
    if (!analysisId || diffIndex == null) {
      return NextResponse.json({ message: "缺少参数" }, { status: 400 });
    }

    const analysis = await prisma.auDevAnalysis.findFirst({
      where: { id: analysisId, userId: session!.user.id },
    });
    if (!analysis) {
      return NextResponse.json({ message: "分析记录不存在" }, { status: 404 });
    }

    const diffPlan: Array<Record<string, unknown>> = analysis.diffPlan
      ? JSON.parse(analysis.diffPlan)
      : [];
    const item = diffPlan[diffIndex];
    if (!item) {
      return NextResponse.json({ message: "方案不存在" }, { status: 404 });
    }

    const asin = analysis.asin;
    const productTitle = analysis.productTitle || "未知产品";
    const price = analysis.price ?? 0;
    const categoryPath = analysis.categoryPath || "";

    const briefSystemPrompt = `你是一位跨境电商产品开发专家，专门帮卖家撰写工厂开发指示单。
请根据以下信息生成一份结构化的工厂开发指示单。
指示单必须用中文，内容要具体、可操作，工厂看了就能直接开始打样。
汇率按 1 AUD = 4.6 RMB 计算。

产品信息：
- ASIN: ${asin}
- 产品名称: ${productTitle}
- 当前售价: A$${price}
- 品类: ${categoryPath}

差异化方案：
- 方向: ${item.title}
- 描述: ${item.description}
- 预估额外成本: ${item.extraCost}
- 竞争优势: ${item.advantage}

请生成以下 JSON 格式（factoryBrief 的值是纯文本字符串，用换行符分段）：
{
  "factoryBrief": "【产品开发指示单】\\n\\n一、参考产品\\n- 参考链接：https://www.amazon.com.au/dp/${asin}\\n- 参考产品名称：${productTitle}\\n- 参考价格：A$${price}（约 ¥${Math.round(price * 4.6)}）\\n\\n二、开发要求\\n- 产品类型：...\\n- 差异化方向：...\\n- 材质/工艺要求：...\\n- 尺寸规格：...\\n- 颜色/外观：...\\n- 包装要求：...\\n- 认证要求：...\\n\\n三、目标成本\\n- 目标出厂价：¥XX-XX（含包装）\\n- MOQ 要求：XXX 件起\\n- 打样费预算：¥XX\\n\\n四、交付时间\\n- 样品交付：X 天内\\n- 大货交付：X 天内（确认样品后）\\n\\n五、补充说明\\n- ..."
}

每个部分的内容都要基于真实产品数据和差异化方案具体填写，不要留占位符。
回复必须是纯 JSON，不要包含 markdown 代码块标记。`;
    const briefUserMsg = `请为 ASIN ${asin} 的差异化方案「${item.title}」生成工厂开发指示单。`;

    let briefResult: { factoryBrief: string } | null = null;
    try {
      briefResult = await claudeJson<{ factoryBrief: string }>({
        system: briefSystemPrompt,
        user: briefUserMsg,
        maxTokens: 4096,
        model: "claude-opus-4-20250514",
      });
    } catch (opusErr) {
      console.error("[au-dev/generate-brief] Opus 失败，降级 Sonnet:", opusErr instanceof Error ? opusErr.message : opusErr);
      briefResult = await claudeJson<{ factoryBrief: string }>({
        system: briefSystemPrompt,
        user: briefUserMsg,
        maxTokens: 4096,
        model: "claude-sonnet-4-20250514",
      });
    }

    if (!briefResult?.factoryBrief) {
      return NextResponse.json({ message: "生成指示单失败：模型返回空结果" }, { status: 500 });
    }

    // Save factoryBrief into the diffPlan item
    diffPlan[diffIndex] = { ...item, factoryBrief: briefResult.factoryBrief };
    await prisma.auDevAnalysis.update({
      where: { id: analysis.id },
      data: { diffPlan: JSON.stringify(diffPlan) },
    });

    const usage = getLastClaudeUsage();
    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        module: "au-dev",
        action: "generate-brief",
        detail: JSON.stringify({ asin: analysis.asin, diffTitle: String(item.title) }),
        tokenUsed: usage ? usage.inputTokens + usage.outputTokens : null,
      },
    }).catch(() => {});

    return NextResponse.json({ factoryBrief: briefResult.factoryBrief });
  } catch (e) {
    return NextResponse.json(
      { message: (e as Error).message },
      { status: 500 }
    );
  }
}
