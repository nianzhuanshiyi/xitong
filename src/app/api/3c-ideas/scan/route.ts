import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { THREE_C_CONFIG, scanBlueOceanKeywords, computeKeywordScore, buildTrendContent } from "@/lib/idea-data-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  const { error } = await requireModuleAccess("3c-ideas");
  if (error) return error;

  try {
    // Clean up old AI-fabricated trends
    await prisma.threeCTrend.deleteMany({ where: { source: { not: "sellersprite_keyword_research" } } });

    const keywords = await scanBlueOceanKeywords(THREE_C_CONFIG);
    if (keywords.length === 0) {
      return NextResponse.json({ message: "未发现符合条件的蓝海关键词，请稍后重试" }, { status: 400 });
    }

    const created = await prisma.$transaction(
      keywords.map((kw) =>
        prisma.threeCTrend.create({
          data: {
            source: "sellersprite_keyword_research",
            market: kw.marketplace,
            title: kw.keyword,
            content: buildTrendContent(kw),
            keywords: JSON.stringify([]),
            category: "phone_accessories",
            trendScore: computeKeywordScore(kw),
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
    return NextResponse.json({ message: e instanceof Error ? e.message : "扫描失败" }, { status: 500 });
  }
}
