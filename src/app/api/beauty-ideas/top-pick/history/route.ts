import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const reports = await prisma.topPickReport.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      reportDate: true,
      productName: true,
      productNameEn: true,
      executiveSummary: true,
      estimatedMargin: true,
      status: true,
      createdAt: true,
      idea: {
        select: {
          totalScore: true,
          recommendation: true,
        },
      },
    },
  });

  return NextResponse.json({ reports });
}
