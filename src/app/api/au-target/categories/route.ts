import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { session, error } = await requireModuleAccess("au-target");
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;

    const categories = await prisma.auCategoryOpportunity.findMany({
      where: {
        userId: session!.user.id,
        ...(status ? { status } : {}),
      },
      orderBy: { score: "desc" },
    });
    return NextResponse.json(categories);
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { session, error } = await requireModuleAccess("au-target");
  if (error) return error;

  try {
    const body = await req.json();
    const category = await prisma.auCategoryOpportunity.create({
      data: {
        ...body,
        userId: session!.user.id,
      },
    });
    return NextResponse.json(category, { status: 201 });
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 500 });
  }
}
