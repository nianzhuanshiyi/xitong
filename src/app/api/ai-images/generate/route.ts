import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { getGoogleAiApiKey } from "@/lib/integration-keys";
import {
  buildFullPrompt,
  generateGeminiProductImage,
} from "@/lib/ai-images/gemini-generate";
import { geminiStyleZ, styleToAiImageType } from "@/lib/ai-images/gemini-styles";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  projectId: z.string(),
  productDescription: z.string().min(1).max(8000),
  style: geminiStyleZ,
  extraNotes: z.string().max(2000).optional().default(""),
});

export async function POST(req: Request) {
  const { session, error } = await requireModuleAccess("ai-images");
  if (error) return error;

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

  const { projectId, productDescription, style, extraNotes } = parsed.data;

  const project = await prisma.imageProject.findFirst({
    where: { id: projectId, userId: session!.user.id },
  });
  if (!project) {
    return NextResponse.json({ message: "项目不存在" }, { status: 404 });
  }

  const apiKey = getGoogleAiApiKey();
  const fullPrompt = buildFullPrompt(style, productDescription, extraNotes);

  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        message: "未配置 GOOGLE_AI_API_KEY（或 GEMINI_API_KEY）。",
        fullPrompt,
      },
      { status: 503 }
    );
  }

  const gen = await generateGeminiProductImage(apiKey, fullPrompt);
  if (!gen.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: gen.message,
        fullPrompt,
      },
      { status: 502 }
    );
  }

  const imageType = styleToAiImageType(style);
  const paramsJson = JSON.stringify({
    source: "gemini-2.5-flash-image",
    style,
    extraNotes: extraNotes || null,
    mimeType: gen.mimeType,
  });

  const row = await prisma.generatedImage.create({
    data: {
      projectId,
      imageType,
      prompt: productDescription,
      fullPrompt,
      promptEn: fullPrompt,
      promptZh: "",
      paramsJson,
      imageUrl: "",
      imageData: gen.base64,
      style,
      status: "completed",
      width: 1024,
      height: 1024,
      filePath: "",
    },
  });

  await prisma.imageProject.update({
    where: { id: projectId },
    data: { updatedAt: new Date() },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      module: "ai-image",
      action: "generate",
      detail: JSON.stringify({ prompt: fullPrompt?.slice(0, 50) }),
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    image: {
      id: row.id,
      style: row.style,
      status: row.status,
      width: row.width,
      height: row.height,
      prompt: row.prompt,
      fullPrompt: row.fullPrompt,
      imageData: row.imageData,
      createdAt: row.createdAt,
    },
  });
}
