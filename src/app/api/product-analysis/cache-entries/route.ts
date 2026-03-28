import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

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
