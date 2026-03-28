import { getClaudeApiKey } from "@/lib/integration-keys";

function extractJsonBlock(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) return fence[1].trim();
  return text.trim();
}

export async function claudeMessages(params: {
  system?: string;
  user: string;
  maxTokens?: number;
}): Promise<string | null> {
  const key = await getClaudeApiKey();
  if (!key) return null;

  const model =
    process.env.CLAUDE_ANALYSIS_MODEL?.trim() || "claude-opus-4-6";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: params.maxTokens ?? 4096,
      ...(params.system ? { system: params.system } : {}),
      messages: [{ role: "user", content: params.user }],
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    try {
      const j = JSON.parse(text) as { error?: { message?: string } };
      throw new Error(j.error?.message ?? text.slice(0, 200));
    } catch (e) {
      if (e instanceof Error && e.message !== text.slice(0, 200)) throw e;
      throw new Error(text.slice(0, 200));
    }
  }

  const data = JSON.parse(text) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const block = data.content?.find((c) => c.type === "text");
  return block?.text ?? null;
}

export async function claudeJson<T>(params: {
  system: string;
  user: string;
}): Promise<T | null> {
  const raw = await claudeMessages({ ...params, maxTokens: 4096 });
  if (!raw) return null;
  try {
    return JSON.parse(extractJsonBlock(raw)) as T;
  } catch {
    return null;
  }
}
