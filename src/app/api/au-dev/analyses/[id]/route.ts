import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { session, error } = await requireModuleAccess("au-dev");
  if (error) return error;

  const analysis = await prisma.auDevAnalysis.findFirst({
    where: { id: params.id, userId: session!.user.id },
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

  const analysis = await prisma.auDevAnalysis.findFirst({
    where: { id: params.id, userId: session!.user.id },
  });

  if (!analysis) {
    return NextResponse.json({ message: "记录不存在" }, { status: 404 });
  }

  await prisma.auDevAnalysis.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true });
}
