import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { getGoogleAiApiKey } from "@/lib/integration-keys";
import { imagenPredict } from "@/lib/google-imagen";
import { aiImageTypeZ, generateFormZ } from "@/lib/ai-images/api-schemas";
import { ensureProjectDirs, publicRoot } from "@/lib/ai-images/paths";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  projectId: z.string(),
  promptEn: z.string().min(8).max(8000),
  promptZh: z.string().max(5000).optional().default(""),
  imageType: aiImageTypeZ,
  form: generateFormZ,
  parentImageId: z.string().optional().nullable(),
});

function enhancePrompt(base: string, form: z.infer<typeof generateFormZ>): string {
  const strength = form.styleStrength;
  const suffix = ` Stylistic interpretation level ${strength}/10 (higher = more artistic).`;
  if (base.length + suffix.length > 3500) return base;
  return base + suffix;
}

export async function POST(req: Request) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ message: "无效的 JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "参数错误", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { projectId, promptEn, promptZh, imageType, form, parentImageId } =
    parsed.data;

  const project = await prisma.imageProject.findFirst({
    where: { id: projectId, userId: session.user.id },
  });
  if (!project) {
    return NextResponse.json({ message: "项目不存在" }, { status: 404 });
  }

  if (parentImageId) {
    const parent = await prisma.generatedImage.findFirst({
      where: { id: parentImageId, projectId },
    });
    if (!parent) {
      return NextResponse.json({ message: "父图片不存在" }, { status: 400 });
    }
  }

  const apiKey = getGoogleAiApiKey();
  const finalPrompt = enhancePrompt(promptEn, form);

  const personGeneration =
    form.imageType === "MODEL_USE" ||
    form.imageType === "LIFESTYLE" ||
    form.imageType === "BEFORE_AFTER"
      ? "allow_adult"
      : "dont_allow";

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      degraded: true,
      promptOnly: true,
      message:
        "未配置 GOOGLE_AI_API_KEY：已保留 Prompt，可复制到 Midjourney 等工具使用。",
      promptEn: finalPrompt,
    });
  }

  const imagen = await imagenPredict(apiKey, {
    prompt: finalPrompt,
    sampleCount: form.count,
    aspectRatio: "1:1",
    imageSize: form.specPreset === "amazon_1600" ? "2K" : "2K",
    personGeneration,
  });

  if (!imagen.ok) {
    return NextResponse.json({
      ok: false,
      degraded: true,
      promptOnly: true,
      message: imagen.error,
      promptEn: finalPrompt,
    });
  }

  ensureProjectDirs(projectId);
  const genDir = path.join(publicRoot(), "uploads", "ai-images", projectId, "gen");

  const paramsJson = JSON.stringify({ form, parentImageId: parentImageId ?? null });

  const created: {
    id: string;
    url: string;
    filePath: string;
  }[] = [];

  for (const buf of imagen.buffers) {
    const fname = `gen-${crypto.randomUUID()}.png`;
    const rel = path
      .join("uploads", "ai-images", projectId, "gen", fname)
      .replace(/\\/g, "/");
    const abs = path.join(genDir, fname);
    await fs.promises.writeFile(abs, buf);

    const row = await prisma.generatedImage.create({
      data: {
        projectId,
        imageType,
        promptEn: finalPrompt,
        promptZh: promptZh ?? "",
        paramsJson,
        filePath: rel,
        parentImageId: parentImageId ?? null,
      },
    });
    created.push({
      id: row.id,
      filePath: rel,
      url: `/${rel}`,
    });
  }

  return NextResponse.json({ ok: true, images: created });
}
