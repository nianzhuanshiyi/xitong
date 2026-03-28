import { parseAsinInput } from "@/lib/asin-parser";
import {
  getSellerspriteMcpUrl,
  getSellerspriteSecret,
} from "@/lib/integration-keys";

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: number;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

function unwrapMcpResult(result: unknown): unknown {
  if (result == null) return null;
  if (typeof result !== "object") return result;
  const r = result as {
    content?: Array<{ type?: string; text?: string }>;
    structuredContent?: unknown;
  };
  if (Array.isArray(r.content)) {
    const texts = r.content
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text as string);
    if (texts.length === 1) {
      const t = texts[0].trim();
      if (t.startsWith("{") || t.startsWith("[")) {
        try {
          return JSON.parse(t);
        } catch {
          return t;
        }
      }
      return t;
    }
    if (texts.length > 1) return texts.join("\n");
  }
  if (r.structuredContent != null) return r.structuredContent;
  return result;
}

/** 与 ASIN 所在站点一致；卖家精灵 MCP 使用小写站点码 */
function marketplaceForMcp(code: string): string {
  const c = code.trim().toUpperCase();
  const map: Record<string, string> = {
    US: "us",
    CA: "ca",
    UK: "uk",
    DE: "de",
    FR: "fr",
    IT: "it",
    ES: "es",
    NL: "nl",
    SE: "se",
    PL: "pl",
    JP: "jp",
    IN: "in",
    AU: "au",
    AE: "ae",
  };
  return map[c] ?? c.toLowerCase();
}

function normalizeToolArguments(
  args: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...args };
  if (typeof out.marketplace === "string") {
    out.marketplace = marketplaceForMcp(out.marketplace);
  }
  if (typeof out.asin === "string") {
    const a = out.asin.trim();
    if (/^B[0-9A-Z]{9}$/i.test(a)) {
      out.asin = a.toUpperCase();
    } else {
      const p = parseAsinInput(a);
      if (p.asins[0]) out.asin = p.asins[0];
    }
  }
  return out;
}

function readSessionId(res: Response): string | null {
  return (
    res.headers.get("mcp-session-id") ??
    res.headers.get("Mcp-Session-Id") ??
    null
  );
}

async function mcpPost(
  url: string,
  secret: string,
  bodyObj: object,
  sessionId: string | null
): Promise<{
  res: Response;
  text: string;
  json: JsonRpcResponse | null;
  sessionIdOut: string | null;
}> {
  const body = JSON.stringify(bodyObj);
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    Accept: "application/json, text/event-stream, */*",
    "secret-key": secret,
    "x-request-id": crypto.randomUUID(),
  };
  if (sessionId) {
    headers["mcp-session-id"] = sessionId;
  }

  console.log("[SellerSprite MCP] request", {
    url,
    sessionId: sessionId ?? undefined,
    body: bodyObj,
  });

  const res = await fetch(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  const sessionIdOut = readSessionId(res);

  let json: JsonRpcResponse | null = null;
  try {
    json = JSON.parse(text) as JsonRpcResponse;
  } catch {
    json = null;
  }

  console.log("[SellerSprite MCP] response", {
    status: res.status,
    sessionIdOut: sessionIdOut ?? undefined,
    jsonrpcError: json?.error ?? undefined,
    bodyPreview: text.length > 2500 ? `${text.slice(0, 2500)}…` : text,
  });

  return { res, text, json, sessionIdOut };
}

export type SellerspriteMcpClient = {
  callTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  callToolSafe: (
    toolName: string,
    args: Record<string, unknown>
  ) => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>;
};

/**
 * 单次分析共用同一 MCP 会话（streamable HTTP 需 initialize + mcp-session-id）。
 * 鉴权：请求头 secret-key（见 https://open.sellersprite.com/mcp/16 ）
 */
export function createSellerspriteMcpClient(): SellerspriteMcpClient {
  const url = getSellerspriteMcpUrl();
  let sessionId: string | null = null;
  let initOnce: Promise<void> | null = null;

  function nextRpcId(): number {
    return Date.now() + Math.floor(Math.random() * 1000);
  }

  function ensureInitialized(secret: string): Promise<void> {
    if (!initOnce) {
      initOnce = (async () => {
        try {
          const initBody = {
            jsonrpc: "2.0",
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: "xitong-product-analysis", version: "1.0.0" },
            },
            id: nextRpcId(),
          };
          const r1 = await mcpPost(url, secret, initBody, null);
          if (r1.sessionIdOut) sessionId = r1.sessionIdOut;
          if (r1.json && !r1.json.error) {
            const note = {
              jsonrpc: "2.0",
              method: "notifications/initialized",
              params: {},
            };
            await mcpPost(url, secret, note, sessionId);
          }
        } catch (e) {
          console.log("[SellerSprite MCP] initialize 异常（将尝试直接 tools/call）", e);
        }
      })();
    }
    return initOnce;
  }

  async function callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const secret = await getSellerspriteSecret();
    if (!secret) throw new Error("未配置 SELLERSPRITE_SECRET_KEY");

    const normArgs = normalizeToolArguments(args);
    const payload = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: toolName, arguments: normArgs },
      id: nextRpcId(),
    };

    await ensureInitialized(secret);

    const { res, text, json, sessionIdOut } = await mcpPost(
      url,
      secret,
      payload,
      sessionId
    );
    if (sessionIdOut) sessionId = sessionIdOut;

    if (!json) {
      throw new Error(`MCP 非 JSON 响应 (${res.status}): ${text.slice(0, 160)}`);
    }
    if (json.error) {
      throw new Error(
        json.error.message ?? `MCP 错误 code=${json.error.code ?? "?"}`
      );
    }
    return unwrapMcpResult(json.result);
  }

  async function callToolSafe(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
    try {
      const data = await callTool(toolName, args);
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  return { callTool, callToolSafe };
}

/** @deprecated 单次调用会重复初始化；请使用 createSellerspriteMcpClient */
export async function sellerspriteCallTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const client = createSellerspriteMcpClient();
  return client.callTool(toolName, args);
}

export async function sellerspriteCallToolSafe(
  toolName: string,
  args: Record<string, unknown>
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const client = createSellerspriteMcpClient();
  return client.callToolSafe(toolName, args);
}
