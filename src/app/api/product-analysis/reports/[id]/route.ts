import { NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { session, error } = await requireModuleAccess("selection-analysis");
  if (error) return error;

  const row = await prisma.productAnalysisReport.findFirst({
    where: { id: params.id, userId: session!.user.id },
  });

  if (!row) {
    return NextResponse.json({ message: "未找到" }, { status: 404 });
  }

  let result = null;
  if (row.resultJson) {
    try {
      result = JSON.parse(row.resultJson);
    } catch {
      result = null;
    }
  }

  return NextResponse.json({
    id: row.id,
    title: row.title,
    marketplace: row.marketplace,
    asins: JSON.parse(row.asinsJson) as string[],
    score: row.score,
    scoreBand: row.scoreBand,
    status: row.status,
    createdAt: row.createdAt,
    result,
  });
}
