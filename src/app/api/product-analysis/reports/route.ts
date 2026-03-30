import { NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireModuleAccess("selection-analysis");
  if (error) return error;

  const rows = await prisma.productAnalysisReport.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      marketplace: true,
      asinsJson: true,
      score: true,
      scoreBand: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    rows.map((r) => {
      let asins: string[] = [];
      try {
        asins = JSON.parse(r.asinsJson) as string[];
      } catch {
        asins = [];
      }
      return {
        id: r.id,
        title: r.title,
        marketplace: r.marketplace,
        asins,
        score: r.score,
        scoreBand: r.scoreBand,
        status: r.status,
        createdAt: r.createdAt,
      };
    })
  );
}
