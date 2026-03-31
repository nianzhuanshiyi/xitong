import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { extractTextFromSupplierFile } from "@/lib/supplier-file-text";
import { absolutePathFromRelative } from "@/lib/supplier-uploads";
import {
  aiExtractCatalogProducts,
  aiCatalogRecommendations,
} from "@/lib/supplier-ai";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";
import { getClaudeApiKey } from "@/lib/integration-keys";

export const dynamic = "force-dynamic";

const MAX_PRODUCTS = 15;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { error } = await requireModuleAccess("suppliers");
  if (error) return error;
  const { id, fileId } = await params;

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || (await getClaudeApiKey());
  if (!apiKey) {
    console.error("[CATALOG-ANALYSIS] ANTHROPIC_API_KEY is not set!");
    return NextResponse.json({ error: "Claude API 密钥未配置" }, { status: 500 });
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

  // Step 2: AI extract products from catalog text
  const extracted = await aiExtractCatalogProducts(text, f.originalName);
  if (!extracted?.products?.length) {
    return NextResponse.json(
      {
        products: [],
        summary: "未能从该目录中提取到产品信息",
        error: "AI 未能识别产品列表",
      },
      { status: 200 }
    );
  }

  const products = extracted.products.slice(0, MAX_PRODUCTS);

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

  // Step 4: AI generate recommendations combining catalog + market data
  const recommendations = await aiCatalogRecommendations({
    products,
    marketData,
    marketplace,
  });

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
