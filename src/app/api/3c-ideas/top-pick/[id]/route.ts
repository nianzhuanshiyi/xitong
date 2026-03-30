import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireModuleAccess("3c-ideas");
  if (error) return error;
  const userId = session.user.id;

  const { id } = await params;
  const report = await prisma.threeCTopPickReport.findUnique({
    where: { id },
    include: {
      idea: {
        select: {
          id: true,
          totalScore: true,
          recommendation: true,
          trendScore: true,
          marketScore: true,
          competitionScore: true,
          profitScore: true,
          searchVolume: true,
        },
      },
    },
  });

  if (!report || report.createdBy !== userId) {
    return NextResponse.json({ message: "方案不存在" }, { status: 404 });
  }

  return NextResponse.json({ report });
}
