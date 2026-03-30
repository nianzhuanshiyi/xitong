import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireModuleAccess("au-target");
  if (error) return error;
  const { id } = await params;

  try {
    // Verify store belongs to user
    const store = await prisma.auCompetitorStore.findFirst({
      where: { id, userId: session!.user.id },
    });
    if (!store) {
      return NextResponse.json({ message: "未找到" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || undefined;
    const sortBy = searchParams.get("sortBy") || "monthlyRevenue";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const products = await prisma.auCompetitorProduct.findMany({
      where: {
        storeId: id,
        ...(category ? { category } : {}),
      },
      orderBy: { [sortBy]: sortOrder },
    });
    return NextResponse.json(products);
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireModuleAccess("au-target");
  if (error) return error;
  const { id } = await params;

  try {
    // Verify store belongs to user
    const store = await prisma.auCompetitorStore.findFirst({
      where: { id, userId: session!.user.id },
    });
    if (!store) {
      return NextResponse.json({ message: "未找到" }, { status: 404 });
    }

    const body = await req.json();
    const { products } = body as { products: Record<string, unknown>[] };

    const created = await prisma.auCompetitorProduct.createMany({
      data: products.map((p) => ({
        ...p,
        storeId: id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any,
    });
    return NextResponse.json({ count: created.count }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 500 });
  }
}
