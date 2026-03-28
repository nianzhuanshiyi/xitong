import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const row = await prisma.productAnalysisReport.findFirst({
    where: { id: params.id, userId: session.user.id },
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
