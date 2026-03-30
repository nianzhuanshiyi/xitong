import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { generateBundlePlanWithClaude } from "@/lib/ai-images/claude-image-prompt";
import { bundleSlotsFromAi } from "@/lib/ai-images/bundle-resolve";
import { DEFAULT_AMAZON_BUNDLE } from "@/lib/ai-images/bundle-defaults";
import { ensureProjectDirs } from "@/lib/ai-images/paths";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  asin: z.string().max(20).optional().nullable(),
  category: z.string().max(200).default(""),
  description: z.string().max(5000).default(""),
});

export async function GET() {
  const { session, error } = await requireModuleAccess("ai-images");
  if (error) return error;

  const rows = await prisma.imageProject.findMany({
    where: { userId: session!.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      asin: true,
      category: true,
      description: true,
      bundlePlanJson: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { generatedImages: true } },
    },
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const { session, error } = await requireModuleAccess("ai-images");
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

  const { name, asin, category, description } = parsed.data;
  const aiSlots = await generateBundlePlanWithClaude({
    name,
    category,
    description,
  });
  const bundle = aiSlots
    ? bundleSlotsFromAi(aiSlots)
    : DEFAULT_AMAZON_BUNDLE;

  const row = await prisma.imageProject.create({
    data: {
      userId: session!.user.id,
      name,
      asin: asin?.trim() || null,
      category,
      description,
      bundlePlanJson: JSON.stringify(bundle),
      referencePathsJson: "[]",
    },
  });
  ensureProjectDirs(row.id);

  return NextResponse.json(
    { ...row, bundlePlan: bundle, bundleFromAi: Boolean(aiSlots) },
    { status: 201 }
  );
}
