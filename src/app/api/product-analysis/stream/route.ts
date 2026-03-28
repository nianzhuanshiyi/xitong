import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runProductAnalysis } from "@/lib/product-analysis/pipeline";
import type { StreamProgressEvent } from "@/lib/product-analysis/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ message: "未登录" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: {
    rawInput?: string;
    purchaseCost?: number;
    firstMile?: number;
    fbaEstimate?: number;
    referralPct?: number;
    adPct?: number;
    returnPct?: number;
    forceRefresh?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ message: "无效的 JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawInput = String(body.rawInput ?? "");
  const profitInput = {
    purchaseCost: Number(body.purchaseCost ?? 0),
    firstMile: Number(body.firstMile ?? 0),
    fbaEstimate: Number(body.fbaEstimate ?? 0),
    referralPct: Number.isFinite(Number(body.referralPct))
      ? Number(body.referralPct)
      : 0.15,
    adPct: Number.isFinite(Number(body.adPct)) ? Number(body.adPct) : 0.15,
    returnPct: Number.isFinite(Number(body.returnPct))
      ? Number(body.returnPct)
      : 0.02,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };

      const onProgress = (e: StreamProgressEvent) => send(e);

      try {
        const { result, reportId, fromCache, cacheMeta } = await runProductAnalysis(
          rawInput,
          profitInput,
          session.user.id,
          onProgress,
          { forceRefresh: Boolean(body.forceRefresh) }
        );
        send({
          type: "complete",
          reportId,
          result,
          fromCache,
          cacheMeta,
        });
      } catch (e) {
        send({
          type: "error",
          message: e instanceof Error ? e.message : String(e),
        });
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
