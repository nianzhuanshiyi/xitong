import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET - 分析详情含对话历史 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const analysis = await prisma.productAnalysis.findUnique({
    where: { id: params.id },
    include: {
      chats: { orderBy: { createdAt: "asc" } },
      email: { select: { subject: true, fromAddress: true, summaryCn: true } },
      supplier: { select: { name: true } },
    },
  });

  if (!analysis) {
    return NextResponse.json({ message: "未找到" }, { status: 404 });
  }

  if (analysis.createdById !== session.user.id) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  return NextResponse.json({ analysis });
}

/** DELETE - 删除分析 */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const analysis = await prisma.productAnalysis.findUnique({
    where: { id: params.id },
    select: { createdById: true },
  });

  if (!analysis) {
    return NextResponse.json({ message: "未找到" }, { status: 404 });
  }

  if (analysis.createdById !== session.user.id) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  await prisma.productAnalysis.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
