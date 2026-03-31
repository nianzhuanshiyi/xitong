import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const { session, error } = await requireModuleAccess("au-dev");
  if (error) return error;

  const analyses = await prisma.auDevAnalysis.findMany({
    where: { userId: session!.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      asin: true,
      productTitle: true,
      productImage: true,
      price: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json(analyses);
}
