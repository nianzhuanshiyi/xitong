import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const { session, error } = await requireModuleAccess("au-target");
  if (error) return error;

  const userId = session!.user.id;

  try {
    const [storePlans, milestones] = await Promise.all([
      prisma.auStorePlan.findMany({
        where: { userId },
        include: { milestones: true },
      }),
      prisma.auMilestone.findMany({
        where: { userId },
        orderBy: { targetDate: "asc" },
        take: 10,
      }),
    ]);

    const totalTarget = 100000000;
    const monthlyTarget = 2780000;
    const audToRmb = 4.6;

    const activePlans = storePlans.filter((p) => p.status === "active");
    const currentMonthlyRevenue = activePlans.reduce(
      (sum, p) => sum + (p.actualMonthlyRevenue ?? 0),
      0
    );
    const currentMonthlyRevenueRmb = currentMonthlyRevenue * audToRmb;
    const progress = Math.min((currentMonthlyRevenueRmb / totalTarget) * 100, 100);

    return NextResponse.json({
      totalTarget,
      monthlyTarget,
      audToRmb,
      currentMonthlyRevenue,
      currentMonthlyRevenueRmb,
      totalActualRevenue: currentMonthlyRevenue,
      progress,
      activeStoreCount: activePlans.length,
      totalStoreCount: storePlans.length,
      milestones,
      storePlans,
    });
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 500 });
  }
}
