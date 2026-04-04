import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";
import { extractKwItems, enrichWithGoogleTrends, computeTrendScore, buildTrendContent } from "@/lib/idea-trend-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  const { error } = await requireModuleAccess("3c-ideas");
  if (error) return error;

  try {
    console.info("[3c-scan] Step1: keyword_research 搜索蓝海关键词...");
    const mcp = createSellerspriteMcpClient();

    let kwRes = await mcp.callToolSafe("keyword_research", {
      request: {
        marketplace: "US",
        departments: ["pc", "wireless", "electronics"],
        minSearches: 1000,
        maxProducts: 300,
        minSupplyDemandRatio: 3,
        maxRatings: 500,
        maxAraClickRate: 0.7,
        minSearchNearlyCr: 10,
        size: 20,
        order: { field: "searches_growth", desc: true },
      },
    });

    if (kwRes.ok && extractKwItems(kwRes.data).length < 5) {
      console.info("[3c-scan] < 5 results, relaxing filters...");
      kwRes = await mcp.callToolSafe("keyword_research", {
        request: { marketplace: "US", departments: ["pc", "wireless", "electronics"], minSearches: 500, maxProducts: 500, minSupplyDemandRatio: 2, maxRatings: 1000, size: 20, order: { field: "searches_growth", desc: true } },
      });
    }

    if (!kwRes.ok) throw new Error(`keyword_research 失败: ${kwRes.error}`);
    const kwItems = extractKwItems(kwRes.data);
    if (kwItems.length === 0) throw new Error("卖家精灵未返回任何关键词数据");
    console.info(`[3c-scan] Step1 完成: ${kwItems.length} 条`);

    console.info("[3c-scan] Step2: Google Trends 验证...");
    const enriched = await enrichWithGoogleTrends(kwItems, "US", mcp, "[3c-scan]");
    console.info(`[3c-scan] Step2 完成: ${enriched.length} 条通过验证`);

    const created = await prisma.$transaction(
      enriched.map((kw) =>
        prisma.threeCTrend.create({
          data: {
            source: "sellersprite_keyword_research",
            market: "US",
            title: String(kw.keywords ?? kw.keyword ?? ""),
            content: buildTrendContent(kw, "$"),
            keywords: JSON.stringify([]),
            category: "phone_accessories",
            trendScore: computeTrendScore(kw),
            sourceUrl: null,
            scannedAt: new Date(),
          },
        })
      )
    );

    return NextResponse.json({
      ok: true,
      message: `已发现 ${created.length} 个蓝海关键词（经 Google Trends 验证）`,
      count: created.length,
    });
  } catch (e) {
    console.error("[3c-scan]", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "扫描失败" },
      { status: 500 }
    );
  }
}
