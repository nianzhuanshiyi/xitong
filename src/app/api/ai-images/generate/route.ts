import { NextResponse } from "next/server";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { getGoogleAiApiKey } from "@/lib/integration-keys";
import {
  buildFullPrompt,
  generateGeminiProductImage,
} from "@/lib/ai-images/gemini-generate";
import { AiImageType } from "@prisma/client";
import { geminiStyleZ, styleToAiImageType, type GeminiImageStyle } from "@/lib/ai-images/gemini-styles";
import { ensureProjectDirs } from "@/lib/ai-images/paths";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  projectId: z.string(),
  productDescription: z.string().min(1).max(8000).optional(),
  style: geminiStyleZ.optional(),
  extraNotes: z.string().max(2000).optional().default(""),

  // Support for older/different workspace format
  promptEn: z.string().optional(),
  promptZh: z.string().optional(),
  imageType: z.string().optional(),
  form: z.record(z.string(), z.unknown()).optional(),
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

  const { projectId, extraNotes, promptEn, promptZh, imageType: bodyImageType, form } = parsed.data;
  let { productDescription, style } = parsed.data;

  // Resolve productDescription and style from different formats
  if (!productDescription && form?.productDescription) {
    productDescription = form.productDescription as string;
  }
  if (!style && form?.imageType) {
    const it = form.imageType as string;
    style = it.toLowerCase() as GeminiImageStyle;
  }
  if (!style) style = "main_image";

  if (!productDescription && !promptEn) {
    return NextResponse.json({ message: "缺失产品描述或 Prompt" }, { status: 400 });
  }

  const project = await prisma.imageProject.findFirst({
    where: { id: projectId, userId: session!.user.id },
  });
  if (!project) {
    return NextResponse.json({ message: "项目不存在" }, { status: 404 });
  }

  const apiKey = getGoogleAiApiKey();

  // If promptEn is provided directly, use it. Otherwise build it.
  const finalPrompt = promptEn || buildFullPrompt(style as string, productDescription as string, extraNotes);

  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        message: "未配置 GOOGLE_AI_API_KEY（或 GEMINI_API_KEY）。",
        fullPrompt: finalPrompt,
      },
      { status: 503 }
    );
  }

  const gen = await generateGeminiProductImage(apiKey, finalPrompt);
  if (!gen.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: gen.message,
        fullPrompt: finalPrompt,
      },
      { status: 502 }
    );
  }

  const imageType = styleToAiImageType(style as string);
  
  // 优化：将图片存储到本地文件系统以提升加载速度
  let filePath = "";
  try {
    ensureProjectDirs(projectId);
    const fileName = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.png`;
    const relativeDir = path.join("uploads", "ai-images", projectId, "gen");
    const fullDir = path.join(process.cwd(), "public", relativeDir);
    const fullPath = path.join(fullDir, fileName);
    
    await fs.writeFile(fullPath, Buffer.from(gen.base64, "base64"));
    filePath = path.join(relativeDir, fileName).replace(/\\/g, "/");
  } catch (err) {
    console.error("Failed to save AI image to disk:", err);
    // 即使保存文件失败，我们也保留数据库中的 imageData 作为备选
  }

  const paramsJson = JSON.stringify({
    source: "gemini-2.5-flash-image",
    style,
    extraNotes: extraNotes || null,
    mimeType: gen.mimeType,
    formUsed: !!form,
  });

  const row = await prisma.generatedImage.create({
    data: {
      projectId,
      imageType: (bodyImageType as AiImageType) || imageType,
      prompt: productDescription || promptZh || "",
      fullPrompt: finalPrompt,
      promptEn: promptEn || finalPrompt,
      promptZh: promptZh || "",
      paramsJson,
      imageUrl: "",
      imageData: gen.base64, // 保留备份
      style: (style as string),
      status: "completed",
      width: 1024,
      height: 1024,
      filePath,
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
      detail: JSON.stringify({ prompt: finalPrompt?.slice(0, 50) }),
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
