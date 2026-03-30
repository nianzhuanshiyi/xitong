import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { session, error } = await requireModuleAccess("au-target");
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const storePlanId = searchParams.get("storePlanId") || undefined;

    const milestones = await prisma.auMilestone.findMany({
      where: {
        userId: session!.user.id,
        ...(storePlanId ? { storePlanId } : {}),
      },
      orderBy: { targetDate: "asc" },
    });
    return NextResponse.json(milestones);
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { session, error } = await requireModuleAccess("au-target");
  if (error) return error;

  try {
    const body = await req.json();
    const milestone = await prisma.auMilestone.create({
      data: {
        ...body,
        userId: session!.user.id,
      },
    });
    return NextResponse.json(milestone, { status: 201 });
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 500 });
  }
}
