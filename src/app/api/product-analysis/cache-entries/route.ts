import { NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/permissions";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireModuleAccess("selection-analysis");
  if (error) return error;

  const rows = await prisma.analysisCache.findMany({
    orderBy: { updatedAt: "desc" },
    take: 150,
    include: {
      analyzedBy: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      asin: r.asin,
      marketplace: r.marketplace,
      score: r.score,
      updatedAt: r.updatedAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      expired: r.expiresAt.getTime() <= Date.now(),
      analystLabel:
        r.analyzedBy.name?.trim() ||
        r.analyzedBy.email?.trim() ||
        "—",
    }))
  );
}
