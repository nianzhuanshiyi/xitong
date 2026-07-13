import type { WalmartParsedUrl } from "./types";

function extractFromPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const seg = segments[i] ?? "";
    if (/^\d{6,}$/.test(seg)) return seg;
  }
  const ipIndex = segments.findIndex((s) => s.toLowerCase() === "ip");
  if (ipIndex >= 0 && segments[ipIndex + 2] && /^\d{6,}$/.test(segments[ipIndex + 2]!)) {
    return segments[ipIndex + 2]!;
  }
  return null;
}

export function parseWalmartProductUrl(raw: string): WalmartParsedUrl {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error("请输入有效的沃尔玛商品链接");
  }

  const host = parsed.hostname.toLowerCase();
  if (!host.includes("walmart.")) {
    throw new Error("仅支持 walmart.com 商品链接");
  }

  const queryId =
    parsed.searchParams.get("productId") ||
    parsed.searchParams.get("itemId") ||
    parsed.searchParams.get("id");
  const fromPath = extractFromPath(parsed.pathname);
  const productId = (queryId && /^\d{6,}$/.test(queryId) ? queryId : fromPath) ?? "";

  if (!productId) {
    throw new Error("链接中未识别到 Walmart productId");
  }

  return {
    url: parsed.toString(),
    productId,
  };
}
