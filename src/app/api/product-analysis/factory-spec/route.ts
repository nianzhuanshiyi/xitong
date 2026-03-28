import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import {
  generateFactorySpecMarkdown,
  type FactorySpecContext,
} from "@/lib/product-analysis/factory-spec";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  parsed: z.object({
    asins: z.array(z.string()).min(1),
    marketplace: z.string(),
    marketplaceLabel: z.string(),
    warnings: z.array(z.string()).optional(),
  }),
  ai: z.object({
    painPoints: z.array(z.any()).default([]),
    reviewSummary: z.string().default(""),
    differentiators: z.array(z.string()).default([]),
  }),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ message: "无效的 JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: "参数无效" }, { status: 400 });
  }

  const ctx: FactorySpecContext = {
    parsed: {
      ...parsed.data.parsed,
      warnings: parsed.data.parsed.warnings ?? [],
    },
    ai: parsed.data.ai,
  };
  const factorySpecMarkdown =
    (await generateFactorySpecMarkdown(ctx)).trim() ||
    "（生成结果为空，请检查 Claude API 配置后重试。）";

  return NextResponse.json({ factorySpecMarkdown });
}
