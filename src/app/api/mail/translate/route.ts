import { NextResponse } from "next/server";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/permissions";
import { claudeTranslateFree } from "@/lib/mail/claude-mail";

export const dynamic = "force-dynamic";

const schema = z.object({
  text: z.string().min(1).max(8000),
  hint: z.string().max(500).optional(),
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
  const out = await claudeTranslateFree(parsed.data.text, parsed.data.hint);
  if (!out) {
    return NextResponse.json({ message: "翻译失败" }, { status: 503 });
  }
  return NextResponse.json({ text: out });
}
