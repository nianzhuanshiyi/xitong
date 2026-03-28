import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";

function truncateJson(data: unknown, max = 8000): string {
  try {
    const s = JSON.stringify(data);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch {
    return String(data).slice(0, max);
  }
}

/**
 * 拉取竞品 Listing 与流量词，拼成给 Claude 的上下文文本
 */
export async function fetchCompetitorContext(params: {
  marketplace: string;
  asins: string[];
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const asins = Array.from(
    new Set(params.asins.map((a) => a.trim().toUpperCase()))
  )
    .filter((a) => /^B[0-9A-Z]{9}$/.test(a))
    .slice(0, 3);

  if (asins.length === 0) {
    return { ok: false, error: "请输入有效 ASIN（1–3 个）" };
  }

  const mcp = createSellerspriteMcpClient();
  const blocks: string[] = [];

  for (const asin of asins) {
    const [d, lst, kw] = await Promise.all([
      mcp.callToolSafe("asin_detail", {
        asin,
        marketplace: params.marketplace,
      }),
      mcp.callToolSafe("traffic_listing", {
        asin,
        marketplace: params.marketplace,
      }),
      mcp.callToolSafe("traffic_keyword", {
        asin,
        marketplace: params.marketplace,
      }),
    ]);

    blocks.push(`=== ASIN ${asin} ===`);
    if (d.ok) {
      blocks.push(`[asin_detail]\n${truncateJson(d.data, 6000)}`);
    } else {
      blocks.push(`[asin_detail ERROR] ${d.error}`);
    }
    if (lst.ok) {
      blocks.push(`[traffic_listing]\n${truncateJson(lst.data, 6000)}`);
    } else {
      blocks.push(`[traffic_listing ERROR] ${lst.error}`);
    }
    if (kw.ok) {
      blocks.push(`[traffic_keyword]\n${truncateJson(kw.data, 6000)}`);
    } else {
      blocks.push(`[traffic_keyword ERROR] ${kw.error}`);
    }
  }

  return { ok: true, text: blocks.join("\n\n") };
}
