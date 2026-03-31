import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { claudeJson } from "@/lib/claude-client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { session, error } = await requireModuleAccess("au-dev");
  if (error) return error;

  const { input } = await req.json();
  if (!input) {
    return NextResponse.json(
      { message: "请输入 ASIN 或产品链接" },
      { status: 400 }
    );
  }

  // Parse ASIN
  let asin = "";
  const dpMatch = input.match(/\/dp\/([A-Z0-9]{10})/i);
  const asinMatch = input.match(/asin=([A-Z0-9]{10})/i);
  if (dpMatch) asin = dpMatch[1].toUpperCase();
  else if (asinMatch) asin = asinMatch[1].toUpperCase();
  else if (/^[A-Z0-9]{10}$/i.test(input.trim()))
    asin = input.trim().toUpperCase();

  if (!asin) {
    return NextResponse.json(
      { message: "无法解析 ASIN，请检查输入" },
      { status: 400 }
    );
  }

  // Create record
  const analysis = await prisma.auDevAnalysis.create({
    data: { asin, userId: session!.user.id, status: "analyzing" },
  });

  // Stream response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };

      try {
        send({
          type: "progress",
          step: 1,
          label: "解析产品链接...",
          percent: 10,
        });

        // Step 2: Call Claude for analysis
        send({
          type: "progress",
          step: 2,
          label: "分析竞品数据...",
          percent: 30,
        });

        const systemPrompt = `你是 Amazon 澳洲站产品开发顾问。澳洲是小市场，竞争远弱于美国。
你的任务不是评分筛选（默认都值得做），而是给出具体可执行的产品开发方案。

核心假设：
- 澳洲站大多数品类，A$500-2000 广告预算能进 Top 10
- 评价 50-100 条就能建立信任度
- 中国供应链有价格和速度优势

用户给你一个 ASIN，你需要基于你的知识（或合理推测）生成以下 JSON：
{
  "product": {
    "title": "产品标题",
    "price": 数字(AUD),
    "rating": 数字,
    "reviews": 数字,
    "bsr": 数字,
    "categoryPath": "品类路径",
    "monthlySales": 数字,
    "monthlyRevenue": 数字(AUD),
    "sellerName": "卖家名",
    "sellerNation": "CN/US/AU/etc",
    "fulfillment": "FBA/FBM"
  },
  "marketOverview": {
    "competitionLevel": "弱/中/强",
    "topConcentration": "Top 3 占销量百分比描述",
    "avgReviews": 数字,
    "newProductShare": "12个月内新品占 Top 10 百分比描述",
    "entryBudget": "预估进 Top 3 需要的广告预算区间 AUD",
    "entryTime": "预估进 Top 3 的时间",
    "summary": "一段话总结市场环境和机会",
    "topProducts": [
      {
        "rank": 1,
        "title": "产品标题",
        "price": 数字,
        "rating": 数字,
        "reviews": 数字,
        "monthlySales": 数字
      }
    ]
  },
  "diffPlan": [
    {
      "title": "差异化方向标题",
      "description": "具体描述怎么改、为什么有效",
      "extraCost": "预估额外采购成本 RMB",
      "advantage": "vs 现有竞品的优势",
      "imagePrompt": "Professional Amazon product photo, [product type], [differentiation], white background, studio lighting, high quality"
    }
  ],
  "profitModel": {
    "suggestedPrice": 数字(AUD),
    "priceRange": "A$XX - A$XX",
    "reasoning": "定价理由",
    "estimatedFba": 数字(AUD),
    "estimatedRefFee": 15
  },
  "actionPlan": [
    {
      "step": 1,
      "title": "步骤标题",
      "description": "具体内容",
      "timeline": "预计时间",
      "cost": "预计费用"
    }
  ]
}

生成 3-5 个差异化方向和 6 个行动步骤。
Top products 生成 8-10 个。
回复必须是纯 JSON，不要包含 markdown 代码块标记。`;

        send({
          type: "progress",
          step: 3,
          label: "AI 生成开发方案...",
          percent: 60,
        });

        const result = await claudeJson<{
          product: {
            title?: string;
            price?: number;
            rating?: number;
            reviews?: number;
            bsr?: number;
            categoryPath?: string;
            monthlySales?: number;
            monthlyRevenue?: number;
            sellerName?: string;
            sellerNation?: string;
            fulfillment?: string;
          };
          marketOverview: Record<string, unknown>;
          diffPlan: Array<Record<string, unknown>>;
          profitModel: Record<string, unknown>;
          actionPlan: Array<Record<string, unknown>>;
        }>({
          system: systemPrompt,
          user: `请分析这个 Amazon 澳洲站产品，ASIN: ${asin}。基于你的知识生成完整的开发方案。`,
          maxTokens: 8192,
        });

        if (!result) {
          throw new Error("AI 分析失败，请重试");
        }

        send({
          type: "progress",
          step: 4,
          label: "保存分析结果...",
          percent: 90,
        });

        // Update DB record
        await prisma.auDevAnalysis.update({
          where: { id: analysis.id },
          data: {
            productTitle: result.product?.title,
            price: result.product?.price,
            rating: result.product?.rating,
            reviews: result.product?.reviews,
            bsr: result.product?.bsr,
            categoryPath: result.product?.categoryPath,
            monthlySales: result.product?.monthlySales,
            monthlyRevenue: result.product?.monthlyRevenue,
            sellerName: result.product?.sellerName,
            sellerNation: result.product?.sellerNation,
            fulfillment: result.product?.fulfillment,
            marketOverview: JSON.stringify(result.marketOverview),
            diffPlan: JSON.stringify(result.diffPlan),
            profitModel: JSON.stringify(result.profitModel),
            actionPlan: JSON.stringify(result.actionPlan),
            status: "completed",
          },
        });

        send({ type: "complete", id: analysis.id, percent: 100 });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "分析失败";
        send({ type: "error", message: msg });
        await prisma.auDevAnalysis
          .update({
            where: { id: analysis.id },
            data: { status: "error", errorMessage: msg },
          })
          .catch(() => {});
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
}
