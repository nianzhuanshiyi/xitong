import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** GET /api/product-dev/stats — 各状态数量统计 */
export async function GET() {
  const { session, error } = await requireModuleAccess("product-dev");
  if (error) return error;
  const userId = session.user.id;

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
      prisma.productDev.count({ where: { createdBy: userId } }),
      ...statuses.map((s) => prisma.productDev.count({ where: { status: s, createdBy: userId } })),
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
