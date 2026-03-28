import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { US_BEAUTY_DEFAULT_FILTERS } from "@/lib/smart-selection-filters";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  marketplace: z.string().min(1).max(16),
  category: z.string().max(200).optional().nullable(),
});

export async function GET() {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const plans = await prisma.smartSelectionPlan.findMany({
    orderBy: [{ active: "desc" }, { slug: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      marketplace: true,
      category: true,
      active: true,
      updatedAt: true,
    },
  });
  return NextResponse.json(plans);
}

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
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "参数错误", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const row = await prisma.smartSelectionPlan.create({
      data: {
        name: parsed.data.name,
        slug: parsed.data.slug,
        marketplace: parsed.data.marketplace,
        category: parsed.data.category ?? null,
        filtersJson: JSON.stringify(US_BEAUTY_DEFAULT_FILTERS),
        active: true,
        createdById: session.user.id,
      },
    });
    return NextResponse.json(row, { status: 201 });
  } catch {
    return NextResponse.json({ message: "slug 已存在或创建失败" }, { status: 409 });
  }
}
