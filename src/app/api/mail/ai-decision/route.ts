import { NextResponse } from "next/server";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/permissions";
import { claudeProcurementAdvice } from "@/lib/mail/claude-mail";

export const dynamic = "force-dynamic";

const schema = z.object({
  context: z.string().min(10).max(20_000),
});

export async function POST(req: Request) {
  const { error } = await requireModuleAccess("email");
  if (error) return error;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ message: "无效的 JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "参数错误", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const text = await claudeProcurementAdvice(parsed.data.context);
  if (!text) {
    return NextResponse.json({ message: "生成失败" }, { status: 503 });
  }
  return NextResponse.json({ text });
}
