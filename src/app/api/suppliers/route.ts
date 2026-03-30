import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma, SupplierStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { faviconUrlFromWebsite } from "@/lib/supplier-uploads";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  nameEn: z.string().max(200).optional().nullable(),
  country: z.string().min(1).max(80),
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
});

function threeMonthsAgo() {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d;
}

export async function GET(req: Request) {
  const { error } = await requireModuleAccess("suppliers");
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20));
  const countryCode = searchParams.get("countryCode");
  const country = searchParams.get("country");
  const category = searchParams.get("category");
  const statusRaw = searchParams.get("status");
  const status =
    statusRaw &&
    ["COOPERATING", "EVALUATING", "CANDIDATE", "REJECTED"].includes(statusRaw)
      ? statusRaw
      : null;
  const sort = searchParams.get("sort") ?? "updated_desc";
  const q = searchParams.get("q")?.trim();

  const where: Prisma.SupplierWhereInput = {};
  if (countryCode) where.countryCode = countryCode;
  if (country && !countryCode) where.country = { contains: country };
  if (status) where.status = status as SupplierStatus;
  if (category?.trim()) {
    where.mainCategories = { contains: category.trim() };
  }
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { nameEn: { contains: q } },
      { mainCategories: { contains: q } },
      { remarks: { contains: q } },
    ];
  }

  let orderBy:
    | Prisma.SupplierOrderByWithRelationInput
    | Prisma.SupplierOrderByWithRelationInput[] = { updatedAt: "desc" };
  if (sort === "score_desc") {
    orderBy = [{ overallScore: "desc" }, { updatedAt: "desc" }];
  } else if (sort === "name_asc") {
    orderBy = { name: "asc" };
  }

  const t0 = threeMonthsAgo();

  const [
    total,
    filteredTotal,
    activeCount,
    pendingEval,
    usCount,
    krCount,
    cnCount,
    items,
  ] = await Promise.all([
    prisma.supplier.count(),
    prisma.supplier.count({ where }),
    prisma.supplier.count({
      where: {
        OR: [{ updatedAt: { gte: t0 } }, { lastActivityAt: { gte: t0 } }],
      },
    }),
    prisma.supplier.count({ where: { status: "EVALUATING" } }),
    prisma.supplier.count({ where: { countryCode: "US" } }),
    prisma.supplier.count({ where: { countryCode: "KR" } }),
    prisma.supplier.count({ where: { countryCode: "CN" } }),
    prisma.supplier.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { files: true } },
      },
    }),
  ]);

  const shaped = items.map(({ _count, ...s }) => ({
    ...s,
    logoUrl: s.logoUrl ?? faviconUrlFromWebsite(s.website),
    fileCount: _count.files,
  }));

  return NextResponse.json({
    items: shaped,
    total: filteredTotal,
    page,
    pageSize,
    stats: {
      total,
      activeLast3Months: activeCount,
      pendingEvaluation: pendingEval,
      byCountry: { US: usCount, KR: krCount, CN: cnCount },
    },
  });
}

export async function POST(req: Request) {
  const { error } = await requireModuleAccess("suppliers");
  if (error) return error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "无效的 JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "参数错误", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const logoUrl = faviconUrlFromWebsite(d.website ?? null);

  const row = await prisma.supplier.create({
    data: {
      name: d.name,
      nameEn: d.nameEn ?? undefined,
      country: d.country,
      countryCode: d.countryCode ?? undefined,
      website: d.website ?? undefined,
      address: d.address ?? undefined,
      mainCategories: d.mainCategories ?? undefined,
      contact: d.contact ?? undefined,
      paymentTerms: d.paymentTerms ?? undefined,
      moq: d.moq ?? undefined,
      sampleLeadDays: d.sampleLeadDays ?? undefined,
      productionLeadDays: d.productionLeadDays ?? undefined,
      cooperationStartDate: d.cooperationStartDate
        ? new Date(d.cooperationStartDate)
        : undefined,
      remarks: d.remarks ?? undefined,
      status: d.status ?? "EVALUATING",
      logoUrl: logoUrl ?? undefined,
      lastActivityAt: new Date(),
    },
    include: { _count: { select: { files: true } } },
  });

  const { _count, ...created } = row;
  return NextResponse.json(
    {
      ...created,
      logoUrl: created.logoUrl ?? faviconUrlFromWebsite(created.website),
      fileCount: _count.files,
    },
    { status: 201 }
  );
}
