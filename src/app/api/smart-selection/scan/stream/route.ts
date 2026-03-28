import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";

const bodySchema = z.object({
  planId: z.string().min(1),
});

/**
 * 智能选品扫描 — SSE 进度流。
 * 当前为框架阶段：推送步骤说明，完成后提示待接入卖家精灵与 Claude。
 */
export async function POST(req: Request) {
  const session = await requireDashboardSession();
  if (!session) {
    return new Response("未登录", { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return new Response("无效的 JSON", { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return new Response("参数错误", { status: 400 });
  }

  const plan = await prisma.smartSelectionPlan.findUnique({
    where: { id: parsed.data.planId },
  });
  if (!plan) {
    return new Response("方案不存在", { status: 404 });
  }
  if (!plan.active) {
    return new Response("该方案尚未开放", { status: 403 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: object) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)
        );
      };

      const sleep = (ms: number) =>
        new Promise((r) => setTimeout(r, ms));

      try {
        send({
          type: "step",
          step: 1,
          label: "调用卖家精灵 product_research，按筛选条件拉取商品列表…",
          progress: 12,
        });
        await sleep(550);
        send({
          type: "step",
          step: 2,
          label: "硬指标初筛：排除列表、价格<$15、评分<3.5、卖家数>5…",
          progress: 32,
        });
        await sleep(500);
        send({
          type: "step",
          step: 3,
          label: "初筛通过的商品调用 asin_detail 拉取详情…",
          progress: 52,
        });
        await sleep(450);
        send({
          type: "step",
          step: 4,
          label: "Claude（claude-opus-4-6）深度评估：差异化、痛点、利润、供应链匹配…",
          progress: 72,
        });
        await sleep(450);
        send({
          type: "step",
          step: 5,
          label: "筛选综合分≥65 的前 3 个商品并写入结果…",
          progress: 90,
        });
        await sleep(350);
        send({
          type: "done",
          ok: false,
          progress: 100,
          message:
            "流水线框架已接通。下一步将在本接口内接入卖家精灵 MCP（product_research / asin_detail）与 Claude 评估，并写入 SmartSelectionScanBatch / SmartSelectionResult。",
        });
      } catch (e) {
        send({
          type: "error",
          message: e instanceof Error ? e.message : "扫描异常",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
