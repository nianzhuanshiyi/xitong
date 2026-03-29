import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const reports = await prisma.dailyThreeCReport.findMany({
    orderBy: { reportDate: "desc" },
    take: 30,
  });

  return NextResponse.json({ reports });
}
