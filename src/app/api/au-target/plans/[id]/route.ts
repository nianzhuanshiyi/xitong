import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireModuleAccess("au-target");
  if (error) return error;
  const { id } = await params;

  try {
    const plan = await prisma.auStorePlan.findFirst({
      where: { id, userId: session!.user.id },
      include: { milestones: true },
    });
    if (!plan) {
      return NextResponse.json({ message: "未找到" }, { status: 404 });
    }
    return NextResponse.json(plan);
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireModuleAccess("au-target");
  if (error) return error;
  const { id } = await params;

  try {
    const body = await req.json();
    const result = await prisma.auStorePlan.updateMany({
      where: { id, userId: session!.user.id },
      data: body,
    });
    if (result.count === 0) {
      return NextResponse.json({ message: "未找到" }, { status: 404 });
    }
    const updated = await prisma.auStorePlan.findUnique({
      where: { id },
      include: { milestones: true },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireModuleAccess("au-target");
  if (error) return error;
  const { id } = await params;

  try {
    const result = await prisma.auStorePlan.deleteMany({
      where: { id, userId: session!.user.id },
    });
    if (result.count === 0) {
      return NextResponse.json({ message: "未找到" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 500 });
  }
}
