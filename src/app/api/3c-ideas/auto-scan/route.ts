import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { scoreIdeaWithKeywordMiner, buildIdeaAnalysis } from "@/lib/idea-scoring";
import {
  THREE_C_CONFIG,
  scanBlueOceanKeywords,
  generateIdeasFromKeywords,
  computeKeywordScore,
  buildTrendContent,
  type BlueOceanKeyword,
} from "@/lib/idea-data-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-auto-sync-secret");
  if (secret !== (process.env.AUTO_SYNC_SECRET || "__internal__")) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const existing = await prisma.dailyThreeCReport.findUnique({ where: { reportDate: today } });
  if (existing && existing.status === "completed") {
    return NextResponse.json({ message: "今日已完成扫描", skipped: true });
  }

  const report = existing ?? await prisma.dailyThreeCReport.create({ data: { reportDate: today, status: "generating" } });
  if (existing) await prisma.dailyThreeCReport.update({ where: { id: report.id }, data: { status: "generating" } });

  try {
    const todayStart = new Date(today + "T00:00:00Z");
    const todayEnd = new Date(today + "T23:59:59Z");
    let createdTrends = await prisma.threeCTrend.findMany({
      where: { createdAt: { gte: todayStart, lte: todayEnd }, source: "sellersprite_keyword_research" },
      orderBy: { trendScore: "desc" },
    });

    let keywords: BlueOceanKeyword[];

    if (createdTrends.length === 0) {
      console.info("[3c-auto-scan] Scanning...");
      keywords = await scanBlueOceanKeywords(THREE_C_CONFIG);
      if (keywords.length === 0) throw new Error("未发现蓝海关键词");

      createdTrends = await prisma.$transaction(
        keywords.map((kw) =>
          prisma.threeCTrend.create({
            data: { source: "sellersprite_keyword_research", market: kw.marketplace, title: kw.keyword, content: buildTrendContent(kw), keywords: JSON.stringify([]), category: "phone_accessories", trendScore: computeKeywordScore(kw), sourceUrl: null, scannedAt: new Date() },
          })
        )
      );
    } else {
      console.info(`[3c-auto-scan] Reusing ${createdTrends.length} today's trends`);
      keywords = createdTrends.map((t) => {
        const s = parseContent(t.content);
        return { keyword: t.title, searches: s.searches, products: s.products, avgRatings: s.avgRatings, avgPrice: 0, bid: s.bid, araClickRate: 0, supplyDemandRatio: s.sdr, growth: s.growth, googleTrendDirection: s.dir, marketplace: t.market };
      });
    }

    console.info("[3c-auto-scan] Generating ideas...");
    const ideas = await generateIdeasFromKeywords(keywords, "3c");
    let ideasCreated = 0, highScore = 0;

    if (ideas.length > 0) {
      const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
      const creatorId = admin?.id ?? "system";

      for (const idea of ideas) {
        const scores = await scoreIdeaWithKeywordMiner(idea.searchKeywords?.[0] ?? "", "US", "[3c-auto-scan]");
        const trendRow = createdTrends.find((t) => t.title === idea.keyword);
        await prisma.threeCProductIdea.create({
          data: {
            trendId: trendRow?.id ?? null, name: idea.name, category: idea.category || "phone_accessories",
            description: idea.description, targetMarket: idea.targetMarket || "US",
            keyFeatures: JSON.stringify(idea.keyIngredients || []),
            sellingPoints: JSON.stringify(idea.sellingPoints || []),
            estimatedPrice: idea.estimatedPrice, estimatedCost: idea.estimatedCost,
            marketData: scores.marketDataJson, searchVolume: scores.searchVolume,
            competitionLevel: scores.competitionLevel, trendScore: scores.trendScore,
            marketScore: scores.marketScore, competitionScore: scores.competitionScore,
            profitScore: scores.profitScore, totalScore: scores.totalScore,
            recommendation: scores.recommendation,
            aiAnalysis: buildIdeaAnalysis(idea.name, idea.description, scores),
            status: "draft", createdBy: creatorId,
          },
        });
        ideasCreated++;
        if (scores.totalScore >= 70) highScore++;
      }
    }

    const trendsSummary = createdTrends.map((t) => `- **${t.title}** (${t.market}, 分数${t.trendScore})`).join("\n");
    const highScoreIdeas = await prisma.threeCProductIdea.findMany({ where: { totalScore: { gte: 70 }, createdAt: { gte: todayStart } }, orderBy: { totalScore: "desc" }, take: 5 });
    const ideasSummary = highScoreIdeas.length > 0 ? highScoreIdeas.map((i) => `- **${i.name}** — 总分 ${i.totalScore}`).join("\n") : "今日无高分创意（≥70分）";

    await prisma.dailyThreeCReport.update({ where: { id: report.id }, data: { trendsFound: createdTrends.length, ideasGenerated: ideasCreated, highScoreIdeas: highScore, trendsSummary, ideasSummary, status: "completed" } });

    return NextResponse.json({ ok: true, date: today, trendsFound: createdTrends.length, ideasGenerated: ideasCreated, highScoreIdeas: highScore });
  } catch (e) {
    console.error("[3c-auto-scan]", e);
    await prisma.dailyThreeCReport.update({ where: { id: report.id }, data: { status: "failed" } });
    return NextResponse.json({ message: e instanceof Error ? e.message : "自动扫描失败" }, { status: 500 });
  }
}

function parseContent(c: string) {
  const n = (p: RegExp) => { const m = c.match(p); return m ? parseFloat(m[1].replace(/,/g, "")) : 0; };
  return { searches: n(/月搜索量([\d,]+)/), growth: n(/增长率([\d.]+)%/), products: n(/商品数(\d+)/), avgRatings: n(/平均评论(\d+)/), sdr: n(/供需比([\d.]+)/), bid: n(/CPC\s*[€$]([\d.]+)/), dir: (c.includes("上升") ? "rising" : c.includes("平稳") ? "stable" : "unknown") as BlueOceanKeyword["googleTrendDirection"] };
}
