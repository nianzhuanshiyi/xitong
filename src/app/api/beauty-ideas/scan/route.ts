import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { claudeJson } from "@/lib/claude-client";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYSTEM_PROMPT = `你是一位资深美妆行业分析师，服务于一家亚马逊跨境美妆卖家。
我们在美国、中国、韩国都有供应链资源，产品主要在亚马逊和TikTok Shop线上销售。

你的任务是扫描最新的美妆趋势，包括：
- 美国市场：FDA新批准成分、Sephora/Ulta热卖新品、TikTok美妆趋势、Amazon Beauty热销榜
- 韩国市场：K-beauty新成分、Olive Young热销、韩国美妆博主推荐、创新配方技术
- 中国市场：天猫/抖音美妆爆品、新锐品牌、新原料趋势、功效护肤新方向

注意：
- 关注成分安全性（FDA合规）和市场需求
- 关注可以线上销售的产品，避免需要线下体验的品类
- 避免已经过度饱和的品类（如普通保湿面霜、基础洁面等）
- 重点关注有差异化空间的新兴趋势

请返回JSON数组，每个元素包含：
{
  "source": "google_trends" | "social_media" | "news" | "industry_report",
  "market": "US" | "KR" | "CN",
  "title": "趋势标题",
  "content": "趋势详细描述（100-200字）",
  "ingredients": ["相关成分1", "成分2"],
  "category": "skincare" | "makeup" | "haircare" | "bodycare" | "fragrance",
  "trendScore": 1-100的热度分数,
  "sourceUrl": "来源链接或null"
}

请返回8-12条最值得关注的趋势。`;

type TrendItem = {
  source: string;
  market: string;
  title: string;
  content: string;
  ingredients: string[];
  category: string;
  trendScore: number;
  sourceUrl?: string | null;
};

export async function POST() {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    console.info("[beauty-scan] 开始调用 Claude API...");
    const trends = await claudeJson<TrendItem[]>({
      system: SYSTEM_PROMPT,
      user: `请扫描当前最新的美妆市场趋势（${new Date().toISOString().slice(0, 10)}），覆盖美国、韩国、中国三个市场。只返回JSON数组，不要包含任何其他文字说明。`,
      maxTokens: 16384,
    });

    console.info("[beauty-scan] Claude 返回:", trends ? `${Array.isArray(trends) ? trends.length : typeof trends} 条` : "null");

    if (!trends || !Array.isArray(trends)) {
      return NextResponse.json({ message: "AI 返回数据格式错误" }, { status: 500 });
    }

    const created = await prisma.$transaction(
      trends.map((t) =>
        prisma.beautyTrend.create({
          data: {
            source: t.source || "social_media",
            market: t.market || "US",
            title: t.title,
            content: t.content,
            ingredients: JSON.stringify(t.ingredients || []),
            category: t.category || "skincare",
            trendScore: Math.min(100, Math.max(1, t.trendScore || 50)),
            sourceUrl: t.sourceUrl || null,
            scannedAt: new Date(),
          },
        })
      )
    );

    return NextResponse.json({
      ok: true,
      message: `已扫描到 ${created.length} 条趋势`,
      count: created.length,
    });
  } catch (e) {
    console.error("[beauty-scan]", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "扫描失败" },
      { status: 500 }
    );
  }
}
