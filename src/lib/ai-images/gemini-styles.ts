import { z } from "zod";
import type { AiImageType } from "@prisma/client";

export const GEMINI_STYLE_VALUES = [
  "main_image",
  "lifestyle",
  "white_bg",
  "infographic",
  "custom",
] as const;

export type GeminiImageStyle = (typeof GEMINI_STYLE_VALUES)[number];

export const geminiStyleZ = z.enum(GEMINI_STYLE_VALUES);

export const GEMINI_STYLE_OPTIONS: {
  value: GeminiImageStyle;
  label: string;
  hint: string;
}[] = [
  {
    value: "main_image",
    label: "🏷️ 亚马逊主图",
    hint: "白底 + 产品特写",
  },
  {
    value: "lifestyle",
    label: "🏠 场景 / 生活方式",
    hint: "产品在使用场景中",
  },
  { value: "white_bg", label: "⬜ 纯白底图", hint: "干净白底商品照" },
  {
    value: "infographic",
    label: "📊 信息图 / 卖点图",
    hint: "标注与卖点说明",
  },
  { value: "custom", label: "🎨 自定义", hint: "完全按你的描述生成" },
];

export function styleToAiImageType(style: string): AiImageType {
  switch (style) {
    case "lifestyle":
      return "LIFESTYLE";
    case "infographic":
      return "INFOGRAPHIC";
    default:
      return "MAIN_WHITE";
  }
}
