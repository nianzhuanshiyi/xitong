import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { claudeJson, getLastClaudeUsage } from "@/lib/claude-client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { session, error } = await requireModuleAccess("au-dev");
  if (error) return error;

  try {
    const { analysisId, userIdea } = await req.json();
    if (!analysisId || !userIdea?.trim()) {
      return NextResponse.json({ message: "缺少参数" }, { status: 400 });
    }

    const analysis = await prisma.auDevAnalysis.findFirst({
      where: { id: analysisId, userId: session!.user.id },
    });
    if (!analysis) {
      return NextResponse.json({ message: "分析记录不存在" }, { status: 404 });
    }

    const productTitle = analysis.productTitle || "未知产品";
    const price = analysis.price ?? 0;
    const categoryPath = analysis.categoryPath || "";

    const result = await claudeJson<{
      title: string;
      description: string;
      extraCost: string;
      advantage: string;
      imagePrompt: string;
      priority: number;
    }>({
      system: `你是 Amazon 澳洲站产品开发顾问。用户对现有差异化方案不满意，提出了自己的想法。
请基于用户的想法和竞品数据，生成一个新的差异化方案。

竞品信息：
- ASIN: ${analysis.asin}
- 产品名称: ${productTitle}
- 当前售价: A$${price}
- 品类: ${categoryPath}

请生成以下 JSON 格式的方案：
{
  "title": "差异化方向标题",
  "description": "具体描述怎么改、为什么有效（要详细、可操作）",
  "extraCost": "预估额外采购成本 RMB",
  "advantage": "vs 现有竞品的优势",
  "imagePrompt": "Professional Amazon product photo, ${productTitle}, [differentiation description], white background, studio lighting, high quality",
  "priority": 数字(1-5，基于可行性评估)
}

回复必须是纯 JSON，不要包含 markdown 代码块标记。`,
      user: `用户的想法：${userIdea.trim()}

请基于这个想法，为 ASIN ${analysis.asin}（${productTitle}）生成一个具体的差异化方案。`,
      maxTokens: 2048,
      model: "claude-opus-4-20250514", // 澳洲开发模块固定用 Opus，不走员工分配模型
    });

    if (!result) {
      return NextResponse.json({ message: "生成方案失败" }, { status: 500 });
    }

    const newItem = {
      ...result,
      isCustom: true,
      factoryBrief: null,
    };

    // Append to existing diffPlan
    const diffPlan: Array<Record<string, unknown>> = analysis.diffPlan
      ? JSON.parse(analysis.diffPlan)
      : [];
    diffPlan.push(newItem);

    await prisma.auDevAnalysis.update({
      where: { id: analysis.id },
      data: { diffPlan: JSON.stringify(diffPlan) },
    });

    const usage = getLastClaudeUsage();
    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        module: "au-dev",
        action: "custom-diff",
        detail: JSON.stringify({ asin: analysis.asin, userInput: userIdea.trim().slice(0, 100) }),
        tokenUsed: usage ? usage.inputTokens + usage.outputTokens : null,
      },
    }).catch(() => {});

    return NextResponse.json({ item: newItem });
  } catch (e) {
    return NextResponse.json(
      { message: (e as Error).message },
      { status: 500 }
    );
  }
}
