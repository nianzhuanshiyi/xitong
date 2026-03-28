import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  title: z.string().max(120).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  phone: z.string().max(80).optional().nullable(),
  wechat: z.string().max(80).optional().nullable(),
  whatsapp: z.string().max(80).optional().nullable(),
  lineId: z.string().max(80).optional().nullable(),
  isPrimary: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const { id, contactId } = await params;

  const existing = await prisma.supplierContact.findFirst({
    where: { id: contactId, supplierId: id },
  });
  if (!existing) {
    return NextResponse.json({ message: "未找到" }, { status: 404 });
  }

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

  if (parsed.data.isPrimary) {
    await prisma.supplierContact.updateMany({
      where: { supplierId: id },
      data: { isPrimary: false },
    });
  }

  const row = await prisma.supplierContact.update({
    where: { id: contactId },
    data: parsed.data,
  });
  await prisma.supplier.update({
    where: { id },
    data: { lastActivityAt: new Date() },
  });
  return NextResponse.json(row);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const { id, contactId } = await params;

  const existing = await prisma.supplierContact.findFirst({
    where: { id: contactId, supplierId: id },
  });
  if (!existing) {
    return NextResponse.json({ message: "未找到" }, { status: 404 });
  }

  await prisma.supplierContact.delete({ where: { id: contactId } });
  await prisma.supplier.update({
    where: { id },
    data: { lastActivityAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
