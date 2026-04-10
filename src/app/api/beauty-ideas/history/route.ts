import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const { session, error } = await requireModuleAccess("beauty-ideas");
  if (error) return error;
  const userId = session.user.id;

  const plans = await prisma.beautyIdeaPlan.findMany({
    where: { createdBy: userId, status: "completed" },
    select: {
      id: true,
      reportDate: true,
      productName: true,
      productNameEn: true,
      executiveSummary: true,
      selectedKeyword: true,
      searchVolume: true,
      totalScore: true,
      recommendation: true,
      competitionLevel: true,
      estimatedRetailPrice: true,
      estimatedMargin: true,
      dismissed: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return NextResponse.json({ plans });
}
