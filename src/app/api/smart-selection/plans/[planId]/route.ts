import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    filtersJson: z.string().min(2).max(500_000).optional(),
    name: z.string().min(1).max(120).optional(),
  })
  .refine((d) => d.filtersJson != null || d.name != null, {
    message: "至少提供 filtersJson 或 name",
  });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ planId: string }> }
) {
  const { session, error } = await requireModuleAccess("selection-analysis");
  if (error) return error;
  const { planId } = await params;
  const plan = await prisma.smartSelectionPlan.findUnique({
    where: { id: planId },
  });
  if (!plan) {
    return NextResponse.json({ message: "未找到" }, { status: 404 });
  }
  if (plan.createdById !== session!.user.id) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }
  return NextResponse.json(plan);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ planId: string }> }
) {
  const { session, error } = await requireModuleAccess("selection-analysis");
  if (error) return error;
  const { planId } = await params;
  const exists = await prisma.smartSelectionPlan.findUnique({
    where: { id: planId },
  });
  if (!exists) {
    return NextResponse.json({ message: "未找到" }, { status: 404 });
  }
  if (exists.createdById !== session!.user.id) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
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

  if (parsed.data.filtersJson != null) {
    try {
      JSON.parse(parsed.data.filtersJson);
    } catch {
      return NextResponse.json(
        { message: "filtersJson 不是合法 JSON" },
        { status: 400 }
      );
    }
  }

  const row = await prisma.smartSelectionPlan.update({
    where: { id: planId },
    data: {
      ...(parsed.data.filtersJson != null
        ? { filtersJson: parsed.data.filtersJson }
        : {}),
      ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
    },
  });
  return NextResponse.json(row);
}
