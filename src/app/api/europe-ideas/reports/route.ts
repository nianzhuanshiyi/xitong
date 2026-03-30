import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireModuleAccess("europe-ideas");
  if (error) return error;

  const reports = await prisma.dailyEuropeReport.findMany({
    orderBy: { reportDate: "desc" },
    take: 30,
  });

  return NextResponse.json({ reports });
}
