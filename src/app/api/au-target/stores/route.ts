import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const { session, error } = await requireModuleAccess("au-target");
  if (error) return error;

  try {
    const stores = await prisma.auCompetitorStore.findMany({
      where: { userId: session!.user.id },
      include: { _count: { select: { products: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(stores);
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { session, error } = await requireModuleAccess("au-target");
  if (error) return error;

  try {
    const body = await req.json();
    const store = await prisma.auCompetitorStore.create({
      data: {
        sellerId: body.sellerId,
        storeUrl: body.storeUrl,
        notes: body.notes ?? undefined,
        name: body.name ?? undefined,
        userId: session!.user.id,
      },
    });
    return NextResponse.json(store, { status: 201 });
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 500 });
  }
}
