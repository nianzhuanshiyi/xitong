import {
  claudeJson,
  claudeMessagesBlocks,
  extractJsonBlock,
} from "@/lib/claude-client";
import { AI_IMAGE_TYPE_VALUES, type AiImageTypeId, type GenerateFormState } from "./types";

function formToNarrative(
  form: GenerateFormState,
  project: { name: string; category: string; description: string }
): string {
  const lines: string[] = [
    `Product name: ${project.name}`,
    `Category: ${project.category || "n/a"}`,
    `Project notes: ${project.description || "n/a"}`,
    `Image type (enum): ${form.imageType}`,
    `Detailed product appearance / materials / colors (user): ${form.productDescription || "n/a"}`,
    `Accent color (hex): ${form.productColor}`,
    `Dimensions note: ${form.productSize || "n/a"}`,
    `Style strength (1-10, higher more artistic): ${form.styleStrength}`,
    `Output count requested: ${form.count}`,
    `Target pixel intent: ${form.specPreset === "amazon_1600" ? "Amazon main 1600x1600 square" : `custom ${form.customWidth ?? "?"}x${form.customHeight ?? "?"}`}`,
  ];

  if (form.imageType === "MAIN_WHITE") {
    lines.push(
      `White-background main shot — angle: ${form.mainAngle}, lighting: ${form.mainLighting}`
    );
  }
  if (form.imageType === "LIFESTYLE") {
    lines.push(
      `Lifestyle — scene: ${form.lifestyleScene}, mood: ${form.lifestyleMood}, time: ${form.lifestyleTime}, style: ${form.lifestyleStyle}`
    );
  }
  if (form.imageType === "MODEL_USE") {
    lines.push(
      `Model — gender: ${form.modelGender}, age: ${form.modelAge}, skin tone preference: ${form.modelSkin}, expression: ${form.modelExpression}`
    );
  }
  if (form.imageType === "INFOGRAPHIC") {
    const pts = (form.sellingPoints ?? [])
      .map((s) => s.trim())
      .filter(Boolean);
    lines.push(
      `Infographic — bullet selling points (${pts.length}): ${pts.join(" | ")}`,
      `Palette mode: ${form.infographicPalette}, layout: ${form.infographicLayout}`
    );
  }

  return lines.join("\n");
}

export type ImagePromptResult = { promptEn: string; promptZh: string };

export async function generateImagePromptWithClaude(params: {
  form: GenerateFormState;
  project: { name: string; category: string; description: string };
  referenceImages?: { mediaType: string; base64: string }[];
}): Promise<ImagePromptResult | null> {
  const narrative = formToNarrative(params.form, params.project);
  const system = `You are an expert Amazon e-commerce product photographer and prompt engineer for AI image generation (Google Imagen / similar).
Rules:
- Output a single JSON object ONLY, no markdown fences, with keys: promptEn (string), promptZh (string).
- promptEn: one detailed English prompt, <= 480 tokens, optimized for photorealistic Amazon listing images. Mention lighting, camera, background, composition, and Amazon policy-friendly content (no misleading claims).
- promptZh: concise Chinese explanation of what the English prompt describes (for the operator).
- For white background main images: pure white seamless background, product fills ~85% frame, no text overlays unless type is infographic.
- For infographics: you may include short English text labels in the prompt (keep brief).`;

  const imgs = params.referenceImages?.slice(0, 5) ?? [];
  const content: Parameters<typeof claudeMessagesBlocks>[0]["content"] = [
    ...imgs.map((img) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: img.mediaType,
        data: img.base64,
      },
    })),
    {
      type: "text" as const,
      text:
        (imgs.length
          ? "Use the reference photos above for product shape, color, and proportions.\n\n"
          : "") + `Generate the JSON for this request:\n\n${narrative}`,
    },
  ];

  const raw = await claudeMessagesBlocks({
    system,
    content,
    maxTokens: 2048,
  });
  if (!raw) return null;
  try {
    const j = JSON.parse(extractJsonBlock(raw)) as ImagePromptResult;
    if (
      typeof j.promptEn === "string" &&
      j.promptEn.trim() &&
      typeof j.promptZh === "string"
    ) {
      return { promptEn: j.promptEn.trim(), promptZh: j.promptZh.trim() };
    }
  } catch {
    return null;
  }
  return null;
}

export type BundlePlanAi = { slots: BundleSlotAi[] };

export type BundleSlotAi = {
  slot: number;
  imageType: AiImageTypeId;
  title: string;
  hintZh: string;
};

const BUNDLE_TYPES_CSV = [
  "MAIN_WHITE",
  "LIFESTYLE",
  "INFOGRAPHIC",
  "SIZE_COMPARE",
  "MODEL_USE",
  "BEFORE_AFTER",
  "PACKAGING",
  "APLUS_STORY",
].join(", ");

export async function generateBundlePlanWithClaude(params: {
  name: string;
  category: string;
  description: string;
}): Promise<BundleSlotAi[] | null> {
  const r = await claudeJson<BundlePlanAi>({
    system: `You plan a 7-image Amazon listing set. Return JSON only: { "slots": [ { "slot": 0-6, "imageType": one of [${BUNDLE_TYPES_CSV}], "title": "short Chinese title", "hintZh": "one line tip" } ] }.
Exactly 7 slots. Slot 0 must be MAIN_WHITE. Use diverse types where appropriate.`,
    user: `Product: ${params.name}\nCategory: ${params.category}\nNotes: ${params.description}`,
  });
  if (!r?.slots || !Array.isArray(r.slots) || r.slots.length !== 7) return null;
  const allowedSet = new Set<string>([...AI_IMAGE_TYPE_VALUES]);
  for (const s of r.slots) {
    if (
      typeof s.slot !== "number" ||
      s.slot < 0 ||
      s.slot > 6 ||
      typeof s.imageType !== "string" ||
      !allowedSet.has(s.imageType)
    )
      return null;
  }
  const sorted = [...r.slots].sort((a, b) => a.slot - b.slot);
  if (sorted[0]?.imageType !== "MAIN_WHITE") return null;
  return sorted as BundleSlotAi[];
}
