import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { mailEnvConfigured } from "@/lib/mail/config";
import {
  runImapSync,
  type SyncProgressPayload,
} from "@/lib/mail/imap-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function wantsNdjsonStream(req: Request): boolean {
  const accept = req.headers.get("accept") ?? "";
  return accept.includes("application/x-ndjson");
}

export async function POST(req: Request) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const { imap } = mailEnvConfigured();
  if (!imap) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "未配置 IMAP 环境变量，请在 .env 中填写 IMAP_HOST、EMAIL_USER、EMAIL_AUTH_CODE",
      },
      { status: 503 }
    );
  }

  if (wantsNdjsonStream(req)) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (p: SyncProgressPayload) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(p)}\n`));
        };
        try {
          await runImapSync({ onProgress: send });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          const stack = e instanceof Error ? e.stack : undefined;
          send({ phase: "error", message, stack });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const r = await runImapSync();
  if (r.error) {
    return NextResponse.json(
      {
        ok: false,
        imported: r.imported,
        analyzed: r.analyzed,
        message: r.error,
        stack: r.errorStack,
      },
      { status: 502 }
    );
  }
  return NextResponse.json({
    ok: true,
    imported: r.imported,
    analyzed: r.analyzed,
    aiSkipped: r.aiSkipped,
    aiFailed: r.aiFailed,
    message: r.note ?? "同步完成",
  });
}
