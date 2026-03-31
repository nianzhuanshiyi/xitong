import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireModuleAccess("au-dev");
  if (error) return error;

  const analysis = await prisma.auDevAnalysis.findUnique({
    where: { id: params.id },
  });

  if (!analysis) {
    return NextResponse.json({ message: "记录不存在" }, { status: 404 });
  }

  return NextResponse.json(analysis);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { session, error } = await requireModuleAccess("au-dev");
  if (error) return error;

  const analysis = await prisma.auDevAnalysis.findUnique({
    where: { id: params.id },
  });

  if (!analysis) {
    return NextResponse.json({ message: "记录不存在" }, { status: 404 });
  }

  // Only owner or admin can delete
  const isOwner = analysis.userId === session!.user.id;
  const isAdmin = session!.user.role === "ADMIN";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ message: "只能删除自己创建的分析记录" }, { status: 403 });
  }

  await prisma.auDevAnalysis.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true });
}
