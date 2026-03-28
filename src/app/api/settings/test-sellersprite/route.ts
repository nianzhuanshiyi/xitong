import { NextResponse } from "next/server";
import {
  getSellerspriteMcpUrl,
  getSellerspriteSecret,
} from "@/lib/integration-keys";
import { requireAdminSession } from "@/lib/require-admin";

async function mcpProbe(
  url: string,
  secret: string,
  style: "secret-key" | "bearer" | "x-api-key" | "query"
): Promise<Response> {
  const initBody = JSON.stringify({
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "xitong-settings", version: "1.0.0" },
    },
    id: 1,
  });

  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    accept: "application/json, text/event-stream, */*",
  };

  let target = url;
  if (style === "secret-key") {
    headers["secret-key"] = secret;
  } else if (style === "bearer") {
    headers.authorization = `Bearer ${secret}`;
  } else if (style === "x-api-key") {
    headers["x-api-key"] = secret;
  } else {
    const u = new URL(url);
    u.searchParams.set("secret-key", secret);
    target = u.toString();
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    return await fetch(target, {
      method: "POST",
      headers,
      body: initBody,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function POST() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "无权限" }, { status: 403 });
  }

  const url = getSellerspriteMcpUrl();
  const secret = await getSellerspriteSecret();

  if (!secret) {
    return NextResponse.json({
      ok: false,
      message: "未配置卖家精灵 Secret（.env 或后台保存）",
    });
  }

  const styles: Array<"secret-key" | "bearer" | "x-api-key" | "query"> = [
    "secret-key",
    "bearer",
    "x-api-key",
    "query",
  ];
  let lastMsg = "";

  for (const style of styles) {
    try {
      const res = await mcpProbe(url, secret, style);
      const ct = res.headers.get("content-type") ?? "";
      const text = await res.text();
      lastMsg = `HTTP ${res.status} · ${text.slice(0, 120)}`;

      if (res.ok) {
        if (
          text.includes("result") ||
          text.includes("capabilities") ||
          text.includes("event:") ||
          ct.includes("text/event-stream")
        ) {
          return NextResponse.json({
            ok: true,
            message: "MCP 端点有响应（连接可用）",
          });
        }
        if (res.status === 200 && text.length < 4000) {
          return NextResponse.json({
            ok: true,
            message: "端点返回 200（请在实际业务中进一步校验 MCP 协议）",
          });
        }
      }
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : "请求异常";
    }
  }

  return NextResponse.json({
    ok: false,
    message: `未能确认连接：${lastMsg}`,
  });
}
