import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { getClaudeApiKey } from "@/lib/integration-keys";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
  console.log("[au-dev/analyze] 请求到达 API");
  const { session, error } = await requireModuleAccess("au-dev");
  if (error) {
    console.warn("[au-dev/analyze] 权限拒绝 — 未登录或无 au-dev 权限");
    return error;
  }
  console.log("[au-dev/analyze] 调用者:", session!.user.email, "角色:", session!.user.role, "allowedModules:", session!.user.allowedModules);

  const { input, forceRefresh } = await req.json();
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

  // Cache: return existing completed analysis if available (shared across all users)
  if (!forceRefresh) {
    const existing = await prisma.auDevAnalysis.findFirst({
      where: { asin, status: "completed" },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } } },
    });
    if (existing) {
      console.log("[au-dev/analyze] 命中缓存，ASIN:", asin, "id:", existing.id);
      return NextResponse.json({
        cached: true,
        id: existing.id,
        cachedAt: existing.createdAt,
        analyzedBy: existing.user?.name || "未知",
      });
    }
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
          console.error("[au-dev/analyze] 卖家精灵 asin_detail 失败:", asinResult.error);
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

        // Step 3: AI analysis with REAL data — direct Anthropic API call
        send({ type: "progress", step: 3, label: "AI 生成开发方案...", percent: 50 });

        // Prepare compact context for AI (reduce tokens)
        const compactCompetitors = competitorData.slice(0, 5).map((c) => {
          const ci = c as Record<string, unknown>;
          return {
            title: String(ci.title ?? ci.productTitle ?? "").slice(0, 80),
            price: ci.price,
            rating: ci.rating,
            reviews: ci.ratings ?? ci.reviews,
            monthlySales: ci.monthlySales ?? ci.sales,
            seller: ci.sellerName,
          };
        });

        const systemPrompt = `你是Amazon澳洲站产品开发顾问。澳洲是小市场，竞争远弱于美国。
核心假设：A$500-2000广告预算能进Top 10，50-100条评价就能建立信任度，中国供应链有优势。
你必须只返回一个JSON对象，不要包含任何其他文字、解释或markdown标记。
JSON结构：
{"marketOverview":{"competitionLevel":"弱/中/强","topConcentration":"描述","avgReviews":数字,"newProductShare":"描述","entryBudget":"A$XX-XX","entryTime":"X周","summary":"一段话","topProducts":[{"rank":1,"title":"标题","price":数字,"rating":数字,"reviews":数字,"monthlySales":数字}]},"diffPlan":[{"title":"方向","description":"详细描述","extraCost":"¥XX","advantage":"优势","imagePrompt":"English prompt for product photo","priority":1,"isCustom":false}],"profitModel":{"suggestedPrice":数字,"priceRange":"A$XX-XX","reasoning":"理由","estimatedFba":数字,"estimatedRefFee":15},"actionPlan":[{"step":1,"title":"标题","description":"内容","timeline":"时间","cost":"费用"}]}
生成3-5个差异化方向，6个行动步骤。priority 1=最推荐。`;

        const userPrompt = `产品：${productData.title}
ASIN：${asin} | 品牌：${productData.brand} | 价格：A$${productData.price}
评分：${productData.rating}（${productData.reviews}评论）| BSR：#${productData.bsr} in ${productData.bsrLabel}
品类：${productData.categoryPath} | 卖家：${productData.sellerName} | 配送：${productData.fulfillment}
重量：${productData.weight} | 尺寸：${productData.dimensions} | 变体：${productData.variations}
同类Top5：${JSON.stringify(compactCompetitors)}
请返回JSON开发方案。`;

        const apiKey = await getClaudeApiKey();
        if (!apiKey) throw new Error("未配置 Claude API Key");

        // Helper: call Anthropic API directly and extract JSON
        const callAnthropicForJson = async (model: string): Promise<Record<string, unknown> | null> => {
          console.log("[au-dev/analyze] 调用 Anthropic API, model:", model);
          const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model,
              max_tokens: 4096,
              system: systemPrompt,
              messages: [{ role: "user", content: userPrompt }],
            }),
          });

          const apiText = await apiRes.text();
          if (!apiRes.ok) {
            console.error(`[au-dev/analyze] API ${apiRes.status}:`, apiText.slice(0, 500));
            throw new Error(`Claude API ${apiRes.status}: ${apiText.slice(0, 200)}`);
          }

          const apiData = JSON.parse(apiText) as {
            content?: Array<{ type: string; text?: string }>;
            usage?: { input_tokens?: number; output_tokens?: number };
          };
          const rawText = apiData.content
            ?.filter((b) => b.type === "text")
            .map((b) => b.text ?? "")
            .join("") ?? "";

          console.log("[au-dev/analyze] AI 原始返回 (前500字):", rawText.slice(0, 500));

          // Strip markdown fences
          let cleaned = rawText.trim();
          if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
          else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
          if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
          cleaned = cleaned.trim();

          // Extract JSON object
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            console.error("[au-dev/analyze] 无法从返回中提取JSON，cleaned前200字:", cleaned.slice(0, 200));
            return null;
          }

          const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

          // Store token usage for activity log
          tokenUsage = (apiData.usage?.input_tokens ?? 0) + (apiData.usage?.output_tokens ?? 0);

          return parsed;
        };

        let tokenUsage = 0;
        type AnalysisResult = {
          marketOverview: Record<string, unknown>;
          diffPlan: Array<Record<string, unknown>>;
          profitModel: Record<string, unknown>;
          actionPlan: Array<Record<string, unknown>>;
        };
        let result: AnalysisResult | null = null;
        let usedModel = "claude-opus-4-20250514";

        try {
          result = (await callAnthropicForJson(usedModel)) as AnalysisResult | null;
        } catch (opusErr) {
          console.error("[au-dev/analyze] Opus 失败，降级 Sonnet:", opusErr instanceof Error ? opusErr.message : opusErr);
          send({ type: "progress", step: 3, label: "Opus 不可用，切换 Sonnet...", percent: 55 });
          usedModel = "claude-sonnet-4-20250514";
          result = (await callAnthropicForJson(usedModel)) as AnalysisResult | null;
        }

        if (!result) {
          throw new Error(`AI 分析失败 (${usedModel})：无法解析返回的JSON，请重试`);
        }
        console.log("[au-dev/analyze] AI 分析完成，model:", usedModel, "ASIN:", asin);

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

        await prisma.activityLog.create({
          data: {
            userId: session!.user.id,
            module: "au-dev",
            action: "analyze",
            detail: JSON.stringify({ asin, title: productData.title, model: usedModel }),
            tokenUsed: tokenUsage || null,
          },
        }).catch(() => {});

        send({ type: "complete", id: analysis.id, percent: 100 });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "分析失败";
        console.error("[au-dev/analyze] 分析流程异常:", e);
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
  } catch (outerErr) {
    console.error("[au-dev/analyze] 外层未捕获异常:", outerErr);
    return NextResponse.json(
      { message: outerErr instanceof Error ? outerErr.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}
