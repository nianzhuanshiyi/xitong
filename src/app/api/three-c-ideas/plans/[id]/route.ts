import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireModuleAccess("three-c-ideas");
  if (error) return error;
  const userId = session.user.id;

  const { id } = await params;
  const plan = await prisma.threeCIdeaPlan.findUnique({ where: { id } });

  if (!plan || plan.createdBy !== userId) {
    return NextResponse.json({ message: "方案不存在" }, { status: 404 });
  }

  return NextResponse.json({ plan });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireModuleAccess("three-c-ideas");
  if (error) return error;
  const userId = session.user.id;

  const { id } = await params;
  const body = await req.json();
  const { action } = body as { action: string };

  const plan = await prisma.threeCIdeaPlan.findUnique({ where: { id } });
  if (!plan || plan.createdBy !== userId) {
    return NextResponse.json({ message: "方案不存在" }, { status: 404 });
  }

  if (action === "dismiss") {
    await prisma.threeCIdeaPlan.update({
      where: { id },
      data: { dismissed: true },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ message: "未知操作" }, { status: 400 });
}
