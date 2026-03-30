import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const { session, error } = await requireModuleAccess("3c-ideas");
  if (error) return error;
  const userId = session.user.id;

  const reports = await prisma.threeCTopPickReport.findMany({
    where: { dismissed: false, status: "completed", createdBy: userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      reportDate: true,
      productName: true,
      productNameEn: true,
      executiveSummary: true,
      estimatedMargin: true,
      estimatedRetailPrice: true,
      status: true,
      phase: true,
      briefScore: true,
      briefCompetition: true,
      briefFeatures: true,
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
