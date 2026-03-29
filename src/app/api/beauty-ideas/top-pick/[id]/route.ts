import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

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
  // All fields are returned via include, including phase/brief/deep fields

  if (!report) {
    return NextResponse.json({ message: "方案不存在" }, { status: 404 });
  }

  return NextResponse.json({ report });
}
