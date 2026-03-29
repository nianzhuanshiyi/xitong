import { GoogleGenerativeAI } from "@google/generative-ai";
import type { GenerationConfig } from "@google/generative-ai";

export function buildFullPrompt(
  style: string,
  productDescription: string,
  extra?: string
): string {
  const stylePrompts: Record<string, string> = {
    main_image: `A professional Amazon product listing main image. Pure white background (#FFFFFF). 
The product is centered, well-lit with soft studio lighting, showing the product clearly from 
a 3/4 angle. High resolution, photorealistic. Avoid human faces or identifiable people. Product: ${productDescription}`,

    lifestyle: `A lifestyle photography for Amazon product listing. The product is shown in 
a natural, aspirational setting without identifiable human faces. Warm, inviting lighting. The scene looks authentic and 
premium. Photorealistic style. Product: ${productDescription}`,

    white_bg: `A clean product photo on pure white background. Studio lighting, minimal soft shadow, 
product centered. Professional e-commerce photography style. Ultra clean and minimal. Product: ${productDescription}`,

    infographic: `An Amazon product infographic image. The product is shown with clear callout 
labels pointing to key features. Clean layout with icons and short text descriptions. Professional design, easy to read. Product: ${productDescription}`,

    custom: productDescription,
  };

  let prompt = stylePrompts[style] ?? stylePrompts.custom;
  if (extra?.trim()) prompt += ` Additional requirements: ${extra.trim()}`;
  return prompt.trim();
}

export type GeminiImageResult =
  | { ok: true; base64: string; mimeType: string }
  | { ok: false; message: string };

export async function generateGeminiProductImage(
  apiKey: string,
  fullPrompt: string
): Promise<GeminiImageResult> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const generationConfig = {
      maxOutputTokens: 8192,
      responseModalities: ["TEXT", "IMAGE"],
    } as unknown as GenerationConfig;
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-image",
      generationConfig,
    });
    const result = await model.generateContent(fullPrompt);
    const response = result.response;
    const cand = response.candidates?.[0];
    if (cand?.finishReason === "SAFETY") {
      return {
        ok: false,
        message:
          "内容被安全策略拦截，请调整产品描述（尽量减少人物相关表述）。",
      };
    }
    const parts = cand?.content?.parts ?? [];
    for (const part of parts) {
      if (
        "inlineData" in part &&
        part.inlineData?.data &&
        typeof part.inlineData.data === "string"
      ) {
        return {
          ok: true,
          base64: part.inlineData.data,
          mimeType: part.inlineData.mimeType || "image/png",
        };
      }
    }
    const textPart = parts.find((p) => "text" in p && p.text) as
      | { text?: string }
      | undefined;
    const text = textPart?.text?.trim();
    return {
      ok: false,
      message: text || "模型未返回图片，请稍后重试。",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}
