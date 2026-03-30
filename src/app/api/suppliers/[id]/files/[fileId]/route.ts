import { NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import { z } from "zod";
import type { SupplierFileCategory } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { absolutePathFromRelative } from "@/lib/supplier-uploads";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  category: z.enum([
    "CATALOG",
    "PRICE_LIST",
    "TEST_REPORT",
    "CERTIFICATION",
    "CONTRACT",
    "PACKAGING",
    "PRODUCT_IMAGE",
    "OTHER",
  ]),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { error } = await requireModuleAccess("suppliers");
  if (error) return error;
  const { id, fileId } = await params;

  const f = await prisma.supplierFile.findFirst({
    where: { id: fileId, supplierId: id },
  });
  if (!f) return NextResponse.json({ message: "未找到" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "无效的 JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "参数错误", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const row = await prisma.supplierFile.update({
    where: { id: fileId },
    data: { category: parsed.data.category as SupplierFileCategory },
    include: { analysis: true },
  });
  await prisma.supplier.update({
    where: { id },
    data: { lastActivityAt: new Date() },
  });
  return NextResponse.json(row);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { error } = await requireModuleAccess("suppliers");
  if (error) return error;
  const { id, fileId } = await params;

  const f = await prisma.supplierFile.findFirst({
    where: { id: fileId, supplierId: id },
  });
  if (!f) return NextResponse.json({ message: "未找到" }, { status: 404 });

  try {
    await unlink(absolutePathFromRelative(f.relativePath));
  } catch {
    /* ignore missing file */
  }

  await prisma.supplierFile.delete({ where: { id: fileId } });
  await prisma.supplier.update({
    where: { id },
    data: { lastActivityAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
