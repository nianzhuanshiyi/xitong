import { NextResponse } from "next/server";
import { getClaudeApiKey } from "@/lib/integration-keys";
import { requireAdminSession } from "@/lib/require-admin";

const MODEL =
  process.env.CLAUDE_TEST_MODEL?.trim() || "claude-opus-4-6";

export async function POST() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "无权限" }, { status: 403 });
  }

  const key = await getClaudeApiKey();
  if (!key) {
    return NextResponse.json({
      ok: false,
      message: "未配置 Claude API Key（请检查 .env 或后台保存的密钥）",
    });
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16,
        messages: [{ role: "user", content: "Reply with exactly: ok" }],
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      let detail = text.slice(0, 200);
      try {
        const j = JSON.parse(text) as { error?: { message?: string } };
        if (j?.error?.message) detail = j.error.message;
      } catch {
        /* ignore */
      }
      return NextResponse.json({
        ok: false,
        message: `Anthropic 返回 ${res.status}：${detail}`,
      });
    }

    return NextResponse.json({ ok: true, message: "已连接 Anthropic API" });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      message: e instanceof Error ? e.message : "请求失败",
    });
  }
}
