import { getClaudeApiKey } from "@/lib/integration-keys";

export function extractJsonBlock(text: string): string {
  // Try fenced code block first
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) return fence[1].trim();
  // Try to find a JSON array or object in the text
  const arrMatch = text.match(/(\[[\s\S]*\])/);
  if (arrMatch?.[1]) return arrMatch[1].trim();
  const objMatch = text.match(/(\{[\s\S]*\})/);
  if (objMatch?.[1]) return objMatch[1].trim();
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
    process.env.CLAUDE_ANALYSIS_MODEL?.trim() || "claude-sonnet-4-20250514";

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
    stop_reason?: string;
  };
  const block = data.content?.find((c) => c.type === "text");

  // Log if truncated
  if (data.stop_reason === "max_tokens") {
    console.warn(`[claudeMessages] 输出被截断 (max_tokens), stop_reason=${data.stop_reason}`);
  }

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
    process.env.CLAUDE_ANALYSIS_MODEL?.trim() || "claude-sonnet-4-20250514";

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
  maxTokens?: number;
}): Promise<T | null> {
  const raw = await claudeMessages({ ...params, maxTokens: params.maxTokens ?? 16384 });
  if (!raw) {
    console.warn("[claudeJson] Claude 返回空内容");
    return null;
  }
  const jsonStr = extractJsonBlock(raw);
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    // Attempt to salvage truncated JSON array
    const salvagedArr = salvagedJsonArray(jsonStr);
    if (salvagedArr) {
      console.warn(`[claudeJson] JSON数组被截断，已修复解析到 ${Array.isArray(salvagedArr) ? (salvagedArr as unknown[]).length : 0} 条`);
      return salvagedArr as T;
    }
    // Attempt to salvage truncated JSON object
    const salvagedObj = salvagedJsonObject(jsonStr);
    if (salvagedObj) {
      console.warn("[claudeJson] JSON对象被截断，已修复解析部分字段");
      return salvagedObj as T;
    }
    console.error("[claudeJson] JSON 解析失败，原始返回 (前800字):", raw.slice(0, 800));
    console.error("[claudeJson] 原始返回 (后200字):", raw.slice(-200));
    return null;
  }
}

/** Try to salvage a truncated JSON array by closing open structures */
function salvagedJsonArray(text: string): unknown | null {
  // Only attempt for arrays
  const trimmed = text.trim();
  if (!trimmed.startsWith("[")) return null;

  // Find the last complete object in the array
  let lastGoodEnd = -1;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "[" || ch === "{") depth++;
    if (ch === "]" || ch === "}") {
      depth--;
      // When we close back to depth 1 (inside the top-level array), we finished an object
      if (depth === 1 && ch === "}") {
        lastGoodEnd = i;
      }
      // If we close the top-level array cleanly, original parse should have worked
      if (depth === 0 && ch === "]") return null;
    }
  }

  if (lastGoodEnd > 0) {
    const partial = trimmed.slice(0, lastGoodEnd + 1) + "]";
    try {
      return JSON.parse(partial);
    } catch {
      return null;
    }
  }
  return null;
}

/** Try to salvage a truncated JSON object by finding last complete key-value pair */
function salvagedJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;

  // Find the last position where we had a complete key-value pair at depth 1
  let lastGoodEnd = -1;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") {
      depth--;
      // If we close the top-level object cleanly, original parse should have worked
      if (depth === 0 && ch === "}") return null;
    }
    // A comma at depth 1 means we finished a complete key-value pair
    if (ch === "," && depth === 1) {
      lastGoodEnd = i;
    }
  }

  if (lastGoodEnd > 0) {
    // Take everything up to the last comma and close the object
    const partial = trimmed.slice(0, lastGoodEnd) + "}";
    try {
      return JSON.parse(partial);
    } catch {
      return null;
    }
  }
  return null;
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
    process.env.CLAUDE_ANALYSIS_MODEL?.trim() || "claude-sonnet-4-20250514";

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
