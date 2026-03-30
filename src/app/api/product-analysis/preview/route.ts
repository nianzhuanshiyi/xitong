import { NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/permissions";
import { parseAsinInput } from "@/lib/asin-parser";
import { guessPriceFromDetail } from "@/lib/product-analysis/utils";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { error } = await requireModuleAccess("selection-analysis");
  if (error) return error;

  let body: { rawInput?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "无效的 JSON" }, { status: 400 });
  }

  const parsed = parseAsinInput(String(body.rawInput ?? ""));
  if (parsed.asins.length === 0) {
    return NextResponse.json({
      parsed,
      previews: [],
      message: "未识别到 ASIN",
    });
  }

  const mcp = createSellerspriteMcpClient();

  const previews: Array<{
    asin: string;
    ok: boolean;
    title?: string;
    image?: string;
    price?: number | null;
    error?: string;
    raw?: unknown;
  }> = [];

  for (const asin of parsed.asins.slice(0, 12)) {
    const r = await mcp.callToolSafe("asin_detail", {
      asin,
      marketplace: parsed.marketplace,
    });
    if (!r.ok) {
      previews.push({ asin, ok: false, error: r.error });
      continue;
    }
    const data = r.data;
    let title: string | undefined;
    let image: string | undefined;
    if (data && typeof data === "object") {
      const o = data as Record<string, unknown>;
      title =
        (o.title as string) ??
        (o.productTitle as string) ??
        (o.name as string);
      image =
        (o.image as string) ??
        (o.mainImage as string) ??
        (o.img as string);
      const imgObj = o.imageUrl as string | undefined;
      if (!image && imgObj) image = imgObj;
    }
    previews.push({
      asin,
      ok: true,
      title,
      image,
      price: guessPriceFromDetail(data),
      raw: data,
    });
  }

  return NextResponse.json({ parsed, previews });
}
