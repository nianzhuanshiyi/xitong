import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { extractTextFromSupplierFile } from "@/lib/supplier-file-text";
import { absolutePathFromRelative } from "@/lib/supplier-uploads";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";

export const dynamic = "force-dynamic";

const MAX_PRODUCTS = 15;

function extractJson(rawText: string): Record<string, unknown> | null {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function callAnthropicJson(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  label: string
): Promise<Record<string, unknown> | null> {
  console.log(`[${label}] Calling Anthropic API, model: claude-sonnet-4-20250514`);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[${label}] API error:`, response.status, errText.slice(0, 500));
    throw new Error(`AI 调用失败: ${response.status}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const rawText =
    data.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("") || "";

  console.log(`[${label}] AI raw response (first 500 chars):`, rawText.slice(0, 500));

  return extractJson(rawText);
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { error } = await requireModuleAccess("suppliers");
  if (error) return error;
  const { id, fileId } = await params;

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    console.error("[CATALOG-ANALYSIS] ANTHROPIC_API_KEY is not set!");
    return NextResponse.json(
      { error: "Claude API 密钥未配置，请联系管理员" },
      { status: 500 }
    );
  }

  const f = await prisma.supplierFile.findFirst({
    where: { id: fileId, supplierId: id },
  });
  if (!f) return NextResponse.json({ message: "未找到" }, { status: 404 });

  if (f.category !== "CATALOG") {
    return NextResponse.json(
      { message: "仅支持产品目录类型文件的深度分析" },
      { status: 400 }
    );
  }

  // Step 1: Extract text from file
  const abs = absolutePathFromRelative(f.relativePath);
  const localExists = existsSync(abs);
  let text: string;

  if (localExists) {
    text = await extractTextFromSupplierFile(abs, f.mimeType, f.originalName);
  } else if (f.fileData) {
    const dbBuf = Buffer.from(f.fileData);
    text = await extractTextFromSupplierFile(dbBuf, f.mimeType, f.originalName);
  } else {
    return NextResponse.json(
      { message: "文件需要重新上传（本地文件已丢失且数据库中无备份）" },
      { status: 404 }
    );
  }

  // Step 2: AI extract products from catalog text (direct fetch)
  type CatalogProduct = { name: string; specs?: string; searchKeyword?: string; estimatedCost?: string };
  let extractedProducts: CatalogProduct[] = [];

  try {
    const result = await callAnthropicJson(
      apiKey,
      `You are analyzing a supplier product catalog. Extract up to 15 distinct products. For each product, provide:
- name: product name (Chinese if available, otherwise English)
- specs: key specifications (size, material, weight, etc.)
- searchKeyword: an English keyword suitable for searching on Amazon Australia (concise, 2-4 words)
- estimatedCost: estimated unit cost if mentioned in the document

Return ONLY valid JSON, no markdown: {"products": [{name, specs, searchKeyword, estimatedCost}]}
Focus on products that are most likely suitable for cross-border e-commerce (Amazon AU).`,
      `Catalog file: ${f.originalName}\n\nContent:\n${text.slice(0, 45_000)}`,
      "CATALOG-EXTRACT"
    );
    if (result && Array.isArray(result.products)) {
      extractedProducts = result.products as CatalogProduct[];
    }
  } catch (e) {
    console.error("[CATALOG-EXTRACT] Failed:", e);
  }

  if (!extractedProducts.length) {
    return NextResponse.json(
      {
        products: [],
        summary: "未能从该目录中提取到产品信息",
        error: "AI 未能识别产品列表",
      },
      { status: 200 }
    );
  }

  const products = extractedProducts.slice(0, MAX_PRODUCTS);

  // Step 3: Query SellerSprite for market data on each product
  const mcp = createSellerspriteMcpClient();
  const marketplace = "AU";

  type MarketInfo = {
    productName: string;
    keyword: string;
    sellerspriteData: Record<string, unknown> | null;
  };

  const marketData: MarketInfo[] = [];

  for (const p of products) {
    const keyword = p.searchKeyword || p.name;
    let ssData: Record<string, unknown> | null = null;

    try {
      const kwResult = await mcp.callToolSafe("keyword_research", {
        keyword,
        marketplace,
      });
      if (kwResult.ok && kwResult.data) {
        ssData = kwResult.data as Record<string, unknown>;
      }
    } catch {
      // SellerSprite query failed for this product, continue
    }

    marketData.push({
      productName: p.name,
      keyword,
      sellerspriteData: ssData,
    });
  }

  // Step 4: AI generate recommendations combining catalog + market data (direct fetch)
  let recommendations: Record<string, unknown> | null = null;

  try {
    recommendations = await callAnthropicJson(
      apiKey,
      `You are an Amazon ${marketplace} cross-border e-commerce product analyst. Given extracted catalog products and SellerSprite market data, generate recommendations.

For each product evaluate:
- recommendedPrice: suggested retail price in AUD
- margin: estimated profit margin percentage
- marketDemand: demand level (高/中/低) with brief reasoning
- competition: competition level (激烈/中等/较低) with brief reasoning
- recommendation: 1-2 sentence recommendation (选品建议) in Chinese

Also provide an overall summary (Chinese, 2-3 sentences) of which products are most promising.
Return ONLY valid JSON, no markdown: {products: [{name, specs, estimatedCost, recommendedPrice, margin, marketDemand, competition, recommendation}], summary}`,
      `Products from catalog:\n${JSON.stringify(products, null, 2)}\n\nMarket data (SellerSprite ${marketplace}):\n${JSON.stringify(marketData, null, 2)}`,
      "CATALOG-RECOMMEND"
    );
  } catch (e) {
    console.error("[CATALOG-RECOMMEND] Failed:", e);
  }

  if (!recommendations) {
    return NextResponse.json({
      products: products.map((p) => ({
        name: p.name,
        specs: p.specs,
      })),
      summary: "市场数据查询完成，但 AI 推荐生成失败",
    });
  }

  return NextResponse.json(recommendations);
}
