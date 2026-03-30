import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireModuleAccess("europe-ideas");
  if (error) return error;

  const { id } = await params;
  const report = await prisma.dailyEuropeReport.findUnique({
    where: { id },
  });

  if (!report) {
    return NextResponse.json({ message: "报告不存在" }, { status: 404 });
  }

  return NextResponse.json({ report });
}
