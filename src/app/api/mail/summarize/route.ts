import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { applyAiSummaryToEmail } from "@/lib/mail/imap-sync";
import { claudeSummarizeEmail } from "@/lib/mail/claude-mail";
import { MailPriority } from "@prisma/client";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  emailId: z.string().optional(),
  bodyText: z.string().max(20_000).optional(),
  /** 为 true 时重新生成摘要与全文翻译（覆盖待办） */
  force: z.boolean().optional(),
});

function mapPri(s: string): MailPriority {
  if (s === "urgent") return MailPriority.URGENT;
  if (s === "low") return MailPriority.LOW;
  return MailPriority.NORMAL;
}

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

  if (parsed.data.emailId) {
    const result = await applyAiSummaryToEmail(parsed.data.emailId, {
      force: parsed.data.force === true,
    });
    if (result === "failed") {
      return NextResponse.json({ message: "摘要失败" }, { status: 503 });
    }
    return NextResponse.json({ ok: true, result });
  }

  const text = parsed.data.bodyText;
  if (!text) {
    return NextResponse.json({ message: "缺少 bodyText 或 emailId" }, { status: 400 });
  }
  const ai = await claudeSummarizeEmail(text);
  if (!ai) {
    return NextResponse.json({ message: "摘要失败" }, { status: 503 });
  }
  return NextResponse.json({
    summary: ai.summary,
    action_items: ai.action_items,
    priority: ai.priority,
    tags: ai.tags,
    priorityDb: mapPri(ai.priority),
  });
}
