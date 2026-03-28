import { getClaudeApiKey } from "@/lib/integration-keys";

export function extractJsonBlock(text: string): string {
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

type ClaudeContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: string;
        data: string;
      };
    };

/** 支持文本 + 参考图（base64）的多模态调用 */
export async function claudeMessagesBlocks(params: {
  system?: string;
  content: ClaudeContentBlock[];
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
      messages: [{ role: "user", content: params.content }],
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

/**
 * Anthropic Messages API 流式输出；聚合完整文本并回调增量（用于 Listing 等长文本生成）
 */
export async function claudeMessagesStream(params: {
  system?: string;
  user: string;
  maxTokens?: number;
  onTextDelta: (delta: string) => void;
}): Promise<string> {
  const key = await getClaudeApiKey();
  if (!key) throw new Error("未配置 Claude API 密钥");

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
      max_tokens: params.maxTokens ?? 16_384,
      stream: true,
      ...(params.system ? { system: params.system } : {}),
      messages: [{ role: "user", content: params.user }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    try {
      const j = JSON.parse(text) as { error?: { message?: string } };
      throw new Error(j.error?.message ?? text.slice(0, 240));
    } catch (e) {
      if (e instanceof Error && e.message !== text.slice(0, 240)) throw e;
      throw new Error(text.slice(0, 240));
    }
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Claude 无响应流");

  let full = "";
  const dec = new TextDecoder();
  let lineBuf = "";

  const flushLine = (line: string) => {
    const t = line.trim();
    if (!t.startsWith("data:")) return;
    const payload = t.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const evt = JSON.parse(payload) as Record<string, unknown>;
      if (evt.type === "content_block_delta") {
        const delta = evt.delta as Record<string, unknown> | undefined;
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          full += delta.text;
          params.onTextDelta(delta.text);
        }
      }
    } catch {
      /* ignore non-JSON lines */
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    lineBuf += dec.decode(value, { stream: true });
    const parts = lineBuf.split("\n");
    lineBuf = parts.pop() ?? "";
    for (const p of parts) flushLine(p);
  }
  if (lineBuf.trim()) flushLine(lineBuf.trim());

  return full;
}
