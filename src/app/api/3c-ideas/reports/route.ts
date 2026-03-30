import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireModuleAccess("3c-ideas");
  if (error) return error;

  const reports = await prisma.dailyThreeCReport.findMany({
    orderBy: { reportDate: "desc" },
    take: 30,
  });

  return NextResponse.json({ reports });
}
