import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { aiMatchSuppliersForCategory } from "@/lib/supplier-ai";

const bodySchema = z.object({
  categoryHint: z.string().min(1).max(2000),
});

export async function POST(req: Request) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "无效的 JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "参数错误", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const suppliers = await prisma.supplier.findMany({
    where: { status: { not: "REJECTED" } },
    select: {
      id: true,
      name: true,
      country: true,
      countryCode: true,
      mainCategories: true,
      moq: true,
      productionLeadDays: true,
      sampleLeadDays: true,
      paymentTerms: true,
      overallScore: true,
      status: true,
    },
    take: 80,
  });

  const brief = suppliers
    .map(
      (s) =>
        `id=${s.id} name=${s.name} country=${s.country} categories=${s.mainCategories ?? ""} moq=${s.moq ?? ""} prodDays=${s.productionLeadDays ?? ""} sampleDays=${s.sampleLeadDays ?? ""} pay=${s.paymentTerms ?? ""} score=${s.overallScore ?? ""} status=${s.status}`
    )
    .join("\n");

  const ai = await aiMatchSuppliersForCategory({
    categoryHint: parsed.data.categoryHint,
    suppliersBrief: brief,
  });

  if (!ai?.matches?.length) {
    return NextResponse.json(
      { message: "AI 未返回匹配结果", matches: [] },
      { status: 502 }
    );
  }

  const byId = new Map(suppliers.map((s) => [s.id, s]));
  const enriched = ai.matches
    .filter((m) => byId.has(m.supplierId))
    .map((m) => ({
      ...m,
      supplier: byId.get(m.supplierId)!,
    }))
    .sort((a, b) => b.score - a.score);

  return NextResponse.json({ matches: enriched });
}
