import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { claudePolishZhToBusinessEn } from "@/lib/mail/claude-mail";

const bodySchema = z.object({
  bodyZh: z.string().min(1).max(50_000),
});

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ message: "无效的 JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "参数错误", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const bodyEn = await claudePolishZhToBusinessEn(parsed.data.bodyZh);
  if (!bodyEn) {
    return NextResponse.json(
      { message: "生成失败或未配置 Claude" },
      { status: 503 }
    );
  }
  return NextResponse.json({ bodyEn });
}
