import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { faviconUrlFromWebsite } from "@/lib/supplier-uploads";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  nameEn: z.string().max(200).optional().nullable(),
  country: z.string().min(1).max(80).optional(),
  countryCode: z.enum(["US", "KR", "CN", "OTHER"]).optional().nullable(),
  website: z.string().max(500).optional().nullable(),
  address: z.string().max(2000).optional().nullable(),
  mainCategories: z.string().max(500).optional().nullable(),
  contact: z.string().max(500).optional().nullable(),
  paymentTerms: z.string().max(500).optional().nullable(),
  moq: z.string().max(200).optional().nullable(),
  sampleLeadDays: z.number().int().min(0).max(3650).optional().nullable(),
  productionLeadDays: z.number().int().min(0).max(3650).optional().nullable(),
  cooperationStartDate: z.string().datetime().optional().nullable(),
  remarks: z.string().max(8000).optional().nullable(),
  status: z
    .enum(["COOPERATING", "EVALUATING", "CANDIDATE", "REJECTED"])
    .optional(),
  overallScore: z.number().min(0).max(5).optional().nullable(),
  profileSummary: z.string().max(8000).optional().nullable(),
  logoUrl: z.string().max(1000).optional().nullable(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const s = await prisma.supplier.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      files: {
        orderBy: { uploadedAt: "desc" },
        include: { analysis: true },
      },
      ratings: { orderBy: { createdAt: "desc" }, take: 20 },
      orders: { orderBy: { orderDate: "desc" }, take: 50 },
      samples: { orderBy: { sampleDate: "desc" }, take: 30 },
      qualityIssues: { orderBy: { issueDate: "desc" }, take: 30 },
      supplierNotes: { orderBy: { createdAt: "desc" }, take: 50 },
      _count: { select: { files: true } },
    },
  });

  if (!s) {
    return NextResponse.json({ message: "未找到" }, { status: 404 });
  }

  const { _count, ...supplier } = s;
  return NextResponse.json({
    ...supplier,
    logoUrl: supplier.logoUrl ?? faviconUrlFromWebsite(supplier.website),
    fileCount: _count.files,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const exists = await prisma.supplier.findUnique({ where: { id } });
  if (!exists) {
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

  const d = parsed.data;
  const { cooperationStartDate, ...rest } = d;
  const data: Prisma.SupplierUpdateInput = {
    ...rest,
    lastActivityAt: new Date(),
  };
  if (cooperationStartDate !== undefined) {
    data.cooperationStartDate = cooperationStartDate
      ? new Date(cooperationStartDate)
      : null;
  }
  if (d.website !== undefined && d.logoUrl === undefined) {
    data.logoUrl = faviconUrlFromWebsite(d.website);
  }

  const row = await prisma.supplier.update({
    where: { id },
    data,
    include: { _count: { select: { files: true } } },
  });

  const { _count, ...updated } = row;
  return NextResponse.json({
    ...updated,
    logoUrl: updated.logoUrl ?? faviconUrlFromWebsite(updated.website),
    fileCount: _count.files,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  try {
    await prisma.supplier.delete({ where: { id } });
  } catch {
    return NextResponse.json({ message: "未找到" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
