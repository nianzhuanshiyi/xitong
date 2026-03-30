import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { claudeJson } from "@/lib/claude-client";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYSTEM_PROMPT = `你是一位资深欧洲跨境电商选品分析师，服务于一家亚马逊跨境卖家。
我们在中国有成熟的供应链，产品主要在亚马逊欧洲站线上销售。

目标市场：Amazon 欧洲站（DE 德国、UK 英国、FR 法国、IT 意大利、ES 西班牙），优先分析 DE 和 UK 站。

你的任务是扫描欧洲市场最新的蓝海产品趋势，包括：
- Amazon 欧洲各站 New Releases、Movers & Shakers、Best Sellers
- Google Trends 欧洲区域
- TikTok / Instagram 欧洲热门产品
- 欧洲本土电商平台趋势（Zalando、Otto等）

选品方向重点：
- 美妆个护（非大牌垄断的细分品类）
- 3C电子配件（Type-C配件、手机周边等）
- 家居生活（收纳、厨房小工具、装饰品）
- 宠物用品（欧洲宠物市场增长快）
- 运动户外（轻量化装备、瑜伽配件）
- 办公用品（居家办公配件）
- 时尚配饰（非服装类，如发饰、手机链等）

必须排除的品类：
- 食品、保健品、医疗器械、儿童玩具、电池类产品、化学品、大件家具

选品标准：
- 售价 ≥15 欧元
- 目标排名 BSR 30-80（非头部位置，蓝海区间）
- 体积小重量轻（<500g优先），FBA友好
- 中国供应链有优势
- 季节性需求产品优先
- 欧洲本土品牌少的品类
- 复购率高的消耗品优先

请返回JSON数组，每个元素包含：
{
  "source": "google_trends" | "social_media" | "news" | "industry_report" | "amazon_bestseller",
  "market": "DE" | "UK" | "FR" | "IT" | "ES",
  "title": "趋势标题",
  "content": "趋势详细描述（100-200字）",
  "keywords": ["相关关键词1", "关键词2"],
  "category": "beauty" | "3c_accessories" | "home" | "pet" | "sports" | "outdoor" | "office" | "fashion_accessories",
  "trendScore": 1-100的热度分数,
  "sourceUrl": "来源链接或null"
}

请返回8-12条最值得关注的趋势。`;

type TrendItem = {
  source: string;
  market: string;
  title: string;
  content: string;
  keywords: string[];
  category: string;
  trendScore: number;
  sourceUrl?: string | null;
};

export async function POST() {
  const { error } = await requireModuleAccess("europe-ideas");
  if (error) return error;

  try {
    console.info("[europe-scan] 开始调用 Claude API...");
    const trends = await claudeJson<TrendItem[]>({
      system: SYSTEM_PROMPT,
      user: `请扫描当前最新的欧洲蓝海产品趋势（${new Date().toISOString().slice(0, 10)}），覆盖DE、UK、FR、IT、ES五个市场。只返回JSON数组，不要包含任何其他文字说明。`,
      maxTokens: 16384,
    });

    console.info("[europe-scan] Claude 返回:", trends ? `${Array.isArray(trends) ? trends.length : typeof trends} 条` : "null");

    if (!trends || !Array.isArray(trends)) {
      return NextResponse.json({ message: "AI 返回数据格式错误" }, { status: 500 });
    }

    const created = await prisma.$transaction(
      trends.map((t) =>
        prisma.europeTrend.create({
          data: {
            source: t.source || "social_media",
            market: t.market || "DE",
            title: t.title,
            content: t.content,
            keywords: JSON.stringify(t.keywords || []),
            category: t.category || "home",
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
    console.error("[europe-scan]", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "扫描失败" },
      { status: 500 }
    );
  }
}
