import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { claudeJson } from "@/lib/claude-client";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYSTEM_PROMPT = `你是一位资深3C电子产品分析师，服务于一家亚马逊跨境3C卖家。
我们在深圳有成熟的3C配件供应链，产品主要在亚马逊美国站、欧洲站、日本站线上销售。

你的任务是扫描最新的3C电子配件趋势，包括：
- 美国市场：CES/新品发布配件需求、Amazon Electronics热销榜、TikTok科技趋势、Reddit/YouTube科技频道热门
- 欧洲市场：Type-C统一标准带来的新机会、欧洲电子配件标准变化、环保法规催生的新品类
- 日本市场：日本特有的3C需求（小巧精致、高品质配件）、Amazon.co.jp热销

选品方向重点：
- 手机/平板/笔电新品（iPhone、iPad、MacBook、Samsung Galaxy、Pixel等）的配件和保护产品
- 智能家居小配件（非大家电）
- 桌面/办公配件（支架、扩展坞、收纳等）
- 车载电子配件
- 新型充电方案（非通用充电宝/数据线等红海）

排除以下红海品类：
- 蓝牙耳机、通用数据线、通用充电器、通用手机壳、钢化膜、移动电源

选品标准：
- 售价 $10-$40
- 体积小重量轻（降低FBA费用）
- 模具成本低（$5000以下）
- 深圳供应链可快速出货

请返回JSON数组，每个元素包含：
{
  "source": "google_trends" | "social_media" | "news" | "industry_report",
  "market": "US" | "EU" | "JP",
  "title": "趋势标题",
  "content": "趋势详细描述（100-200字）",
  "keywords": ["相关关键词1", "关键词2"],
  "category": "phone_accessories" | "computer_peripherals" | "smart_home" | "audio" | "wearable" | "charging" | "storage",
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
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    console.info("[3c-scan] 开始调用 Claude API...");
    const trends = await claudeJson<TrendItem[]>({
      system: SYSTEM_PROMPT,
      user: `请扫描当前最新的3C电子配件市场趋势（${new Date().toISOString().slice(0, 10)}），覆盖美国、欧洲、日本三个市场。只返回JSON数组，不要包含任何其他文字说明。`,
      maxTokens: 16384,
    });

    console.info("[3c-scan] Claude 返回:", trends ? `${Array.isArray(trends) ? trends.length : typeof trends} 条` : "null");

    if (!trends || !Array.isArray(trends)) {
      return NextResponse.json({ message: "AI 返回数据格式错误" }, { status: 500 });
    }

    const created = await prisma.$transaction(
      trends.map((t) =>
        prisma.threeCTrend.create({
          data: {
            source: t.source || "social_media",
            market: t.market || "US",
            title: t.title,
            content: t.content,
            keywords: JSON.stringify(t.keywords || []),
            category: t.category || "phone_accessories",
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
    console.error("[3c-scan]", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "扫描失败" },
      { status: 500 }
    );
  }
}
