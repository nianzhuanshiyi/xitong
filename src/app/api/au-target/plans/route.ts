import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const { session, error } = await requireModuleAccess("au-target");
  if (error) return error;

  try {
    const plans = await prisma.auStorePlan.findMany({
      where: { userId: session!.user.id },
      include: { milestones: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(plans);
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { session, error } = await requireModuleAccess("au-target");
  if (error) return error;

  try {
    const body = await req.json();
    const plan = await prisma.auStorePlan.create({
      data: {
        ...body,
        userId: session!.user.id,
      },
    });
    return NextResponse.json(plan, { status: 201 });
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 500 });
  }
}
