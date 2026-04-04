import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";
import { extractKwItems, enrichWithGoogleTrends, computeTrendScore, buildTrendContent } from "@/lib/idea-trend-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  const { error } = await requireModuleAccess("europe-ideas");
  if (error) return error;

  try {
    console.info("[europe-scan] Step1: keyword_research 搜索欧洲蓝海关键词...");
    const mcp = createSellerspriteMcpClient();
    const allEnriched: Parameters<typeof computeTrendScore>[0][] = [];

    for (const market of ["DE", "UK", "FR"] as const) {
      let kwRes = await mcp.callToolSafe("keyword_research", {
        request: { marketplace: market, minSearches: 500, maxProducts: 200, minSupplyDemandRatio: 3, maxRatings: 300, maxAraClickRate: 0.7, minSearchNearlyCr: 10, size: 10, order: { field: "searches_growth", desc: true } },
      });
      if (kwRes.ok && extractKwItems(kwRes.data).length < 3) {
        kwRes = await mcp.callToolSafe("keyword_research", {
          request: { marketplace: market, minSearches: 300, maxProducts: 500, size: 10, order: { field: "searches_growth", desc: true } },
        });
      }
      if (kwRes.ok) {
        const items = extractKwItems(kwRes.data);
        console.info(`[europe-scan] ${market}: ${items.length} keywords`);
        const enriched = await enrichWithGoogleTrends(items, market, mcp, `[europe-scan:${market}]`);
        allEnriched.push(...enriched);
      } else {
        console.warn(`[europe-scan] ${market} failed:`, kwRes.error);
      }
    }

    if (allEnriched.length === 0) throw new Error("卖家精灵未返回任何欧洲关键词数据");

    // Sort: rising first
    const order: Record<string, number> = { rising: 0, stable: 1, unknown: 2, declining: 3 };
    allEnriched.sort((a, b) => (order[a._trendDirection] ?? 2) - (order[b._trendDirection] ?? 2));

    const created = await prisma.$transaction(
      allEnriched.map((kw) =>
        prisma.europeTrend.create({
          data: {
            source: "sellersprite_keyword_research",
            market: kw._market,
            title: String(kw.keywords ?? kw.keyword ?? ""),
            content: buildTrendContent(kw, "€"),
            keywords: JSON.stringify([]),
            category: "home",
            trendScore: computeTrendScore(kw, true),
            sourceUrl: null,
            scannedAt: new Date(),
          },
        })
      )
    );

    return NextResponse.json({
      ok: true,
      message: `已发现 ${created.length} 个欧洲蓝海关键词（经 Google Trends 验证）`,
      count: created.length,
    });
  } catch (e) {
    console.error("[europe-scan]", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "扫描失败" },
      { status: 500 }
    );
  }
}
