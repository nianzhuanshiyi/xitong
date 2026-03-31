import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { session, error } = await requireModuleAccess("au-dev");
  if (error) return error;

  try {
    const { analysisId, prompt, diffDirection } = await req.json();
    if (!analysisId || !prompt) {
      return NextResponse.json({ message: "缺少参数" }, { status: 400 });
    }

    // Verify ownership
    const analysis = await prisma.auDevAnalysis.findFirst({
      where: { id: analysisId, userId: session!.user.id },
    });
    if (!analysis) {
      return NextResponse.json(
        { message: "分析记录不存在" },
        { status: 404 }
      );
    }

    // Try Google Imagen API first
    let imageUrl = "";
    try {
      const { imagenPredict } = await import("@/lib/google-imagen");
      const apiKey = process.env.GOOGLE_AI_API_KEY || "";
      const result = await imagenPredict(apiKey, {
        prompt,
        sampleCount: 1,
        aspectRatio: "1:1",
      });
      if (result.ok && result.buffers.length > 0) {
        imageUrl = `data:image/png;base64,${result.buffers[0].toString("base64")}`;
      }
    } catch {
      // Fallback: try Gemini
      try {
        const { generateGeminiProductImage } = await import(
          "@/lib/ai-images/gemini-generate"
        );
        const apiKey = process.env.GOOGLE_AI_API_KEY || "";
        const result = await generateGeminiProductImage(apiKey, prompt);
        if (result.ok) {
          imageUrl = `data:${result.mimeType};base64,${result.base64}`;
        }
      } catch {
        return NextResponse.json(
          { message: "图片生成服务不可用" },
          { status: 503 }
        );
      }
    }

    if (!imageUrl) {
      return NextResponse.json(
        { message: "图片生成失败" },
        { status: 500 }
      );
    }

    // Append to generatedImages
    const existing: Array<Record<string, unknown>> = analysis.generatedImages
      ? JSON.parse(analysis.generatedImages)
      : [];
    existing.push({
      url: imageUrl,
      prompt,
      diffDirection,
      createdAt: new Date().toISOString(),
    });

    await prisma.auDevAnalysis.update({
      where: { id: analysis.id },
      data: { generatedImages: JSON.stringify(existing) },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        module: "au-dev",
        action: "generate-image",
        detail: JSON.stringify({ asin: analysis.asin, prompt: prompt?.slice(0, 100) }),
      },
    }).catch(() => {});

    return NextResponse.json({ imageUrl, prompt, diffDirection });
  } catch (e) {
    return NextResponse.json(
      { message: (e as Error).message },
      { status: 500 }
    );
  }
}
