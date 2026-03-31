import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { claudeJson } from "@/lib/claude-client";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";
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
        // Step 1: Fetch real product data from SellerSprite MCP
        send({ type: "progress", step: 1, label: "拉取卖家精灵产品数据...", percent: 10 });

        const mcp = createSellerspriteMcpClient();
        const asinResult = await mcp.callToolSafe("asin_detail", {
          asin,
          marketplace: "AU",
        });

        if (!asinResult.ok) {
          throw new Error(`卖家精灵数据拉取失败: ${asinResult.error}`);
        }

        // MCP returns {code:"OK", data:{...}} — unwrap the inner data
        const raw = asinResult.data as Record<string, unknown>;
        const d = (raw.data && typeof raw.data === "object" ? raw.data : raw) as Record<string, unknown>;
        const productData = {
          title: String(d.title ?? ""),
          price: Number(d.price ?? 0),
          rating: Number(d.rating ?? 0),
          reviews: Number(d.ratings ?? d.reviews ?? 0),
          bsr: Number(d.bsrRank ?? 0),
          bsrLabel: String(d.bsrLabel ?? ""),
          categoryPath: String(d.nodeLabelPath ?? d.nodeIdPath ?? ""),
          imageUrl: String(d.imageUrl ?? d.zoomImageUrl ?? ""),
          sellerName: String(d.sellerName ?? ""),
          fulfillment: String(d.fulfillment ?? ""),
          brand: String(d.brand ?? ""),
          nodeIdPath: String(d.nodeIdPath ?? ""),
          weight: String(d.weight ?? ""),
          dimensions: String(d.dimensions ?? ""),
          variations: Number(d.variations ?? 0),
        };

        // Save real product data to DB immediately
        await prisma.auDevAnalysis.update({
          where: { id: analysis.id },
          data: {
            productTitle: productData.title,
            productImage: productData.imageUrl,
            price: productData.price,
            rating: productData.rating,
            reviews: productData.reviews,
            bsr: productData.bsr,
            categoryPath: productData.categoryPath,
            sellerName: productData.sellerName,
            fulfillment: productData.fulfillment,
          },
        });

        // Step 2: Fetch market data (Top 10 competitors)
        send({ type: "progress", step: 2, label: "拉取市场竞品数据...", percent: 30 });

        let competitorData: unknown[] = [];
        if (productData.nodeIdPath) {
          const compResult = await mcp.callToolSafe("competitor_lookup", {
            marketplace: "AU",
            asin,
          });
          if (compResult.ok) {
            // competitor_lookup may return {code, data: [...]} or {code, data: {items: [...]}} or just [...]
            const compRaw = compResult.data;
            const unwrapComp = (v: unknown): unknown => {
              if (v && typeof v === "object" && "data" in (v as Record<string, unknown>)) {
                return (v as Record<string, unknown>).data;
              }
              return v;
            };
            const compInner = unwrapComp(compRaw);
            if (Array.isArray(compInner)) {
              competitorData = compInner;
            } else if (
              compInner &&
              typeof compInner === "object" &&
              "items" in (compInner as Record<string, unknown>)
            ) {
              competitorData = (compInner as Record<string, unknown>).items as unknown[];
            }
          }
        }

        // Step 3: AI analysis with REAL data as context
        send({ type: "progress", step: 3, label: "AI 生成开发方案...", percent: 50 });

        const competitorSummary = competitorData.length > 0
          ? competitorData.slice(0, 10).map((c, i) => {
              const item = c as Record<string, unknown>;
              return `  ${i + 1}. ${item.title ?? item.productTitle ?? "未知"} | A$${item.price ?? "?"} | ★${item.rating ?? "?"} | ${item.ratings ?? item.reviews ?? "?"}评论 | 月销${item.monthlySales ?? item.sales ?? "?"}`;
            }).join("\n")
          : "（暂无竞品数据）";

        const systemPrompt = `你是 Amazon 澳洲站产品开发顾问。澳洲是小市场，竞争远弱于美国。
你的任务不是评分筛选（默认都值得做），而是给出具体可执行的产品开发方案。

核心假设：
- 澳洲站大多数品类，A$500-2000 广告预算能进 Top 10
- 评价 50-100 条就能建立信任度
- 中国供应链有价格和速度优势

以下是卖家精灵返回的真实产品数据，请基于这些真实数据进行分析：
- 产品标题：${productData.title}
- ASIN：${asin}
- 品牌：${productData.brand}
- 价格：A$${productData.price}
- 评分：${productData.rating}（${productData.reviews}条评论）
- BSR：#${productData.bsr} in ${productData.bsrLabel}
- 品类路径：${productData.categoryPath}
- 卖家：${productData.sellerName}
- 配送方式：${productData.fulfillment}
- 变体数：${productData.variations}
- 重量：${productData.weight}
- 尺寸：${productData.dimensions}

同品类竞品（Top 10）：
${competitorSummary}

请基于以上真实数据，生成以下 JSON（不要修改产品的真实数据，只分析和建议）：
{
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
      "imagePrompt": "Professional Amazon product photo, ${productData.title}, [differentiation description], white background, studio lighting, high quality",
      "priority": 1,
      "isCustom": false
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

每个差异化方案必须包含 priority 字段（1=最推荐，数字越大优先级越低）。
排序依据：综合考虑"额外成本低 + 竞争优势大 + 落地难度小"，最容易执行且效果最好的排第一。
每个方案的 isCustom 字段固定为 false。

生成 3-5 个差异化方向和 6 个行动步骤。
如果有竞品数据，topProducts 直接用真实竞品数据填写；如果没有竞品数据，可以合理推测 8-10 个。
回复必须是纯 JSON，不要包含 markdown 代码块标记。`;

        const result = await claudeJson<{
          marketOverview: Record<string, unknown>;
          diffPlan: Array<Record<string, unknown>>;
          profitModel: Record<string, unknown>;
          actionPlan: Array<Record<string, unknown>>;
        }>({
          system: systemPrompt,
          user: `请基于上面提供的卖家精灵真实数据，为 ASIN ${asin}（${productData.title}）生成完整的澳洲站产品开发方案。`,
          maxTokens: 8192,
        });

        if (!result) {
          throw new Error("AI 分析失败，请重试");
        }

        // Step 4: Save AI analysis results (product data already saved in step 1)
        send({ type: "progress", step: 4, label: "保存分析结果...", percent: 90 });

        await prisma.auDevAnalysis.update({
          where: { id: analysis.id },
          data: {
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
