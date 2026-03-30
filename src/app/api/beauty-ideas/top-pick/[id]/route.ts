import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireModuleAccess("beauty-ideas");
  if (error) return error;

  const { id } = await params;
  const report = await prisma.topPickReport.findUnique({
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

  if (!report) {
    return NextResponse.json({ message: "方案不存在" }, { status: 404 });
  }

  if (report.createdBy !== session!.user.id) {
    return NextResponse.json({ message: "无权访问" }, { status: 403 });
  }

  return NextResponse.json({ report });
}
