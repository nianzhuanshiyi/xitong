import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";

export const dynamic = "force-dynamic";

/** GET /api/product-dev/stats — 各状态数量统计 */
export async function GET() {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    const statuses = [
      "idea",
      "research",
      "sampling",
      "testing",
      "listing",
      "launched",
      "abandoned",
    ] as const;

    const [total, ...counts] = await Promise.all([
      prisma.productDev.count(),
      ...statuses.map((s) => prisma.productDev.count({ where: { status: s } })),
    ]);

    const byStatus: Record<string, number> = {};
    statuses.forEach((s, i) => {
      byStatus[s] = counts[i];
    });

    return NextResponse.json({ total, byStatus });
  } catch (e) {
    console.error("[product-dev/stats] GET error:", e);
    return NextResponse.json(
      { message: "统计查询失败", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
