import { z } from "zod";

export const aiImageTypeZ = z.enum([
  "MAIN_WHITE",
  "LIFESTYLE",
  "INFOGRAPHIC",
  "SIZE_COMPARE",
  "MODEL_USE",
  "BEFORE_AFTER",
  "PACKAGING",
  "APLUS_STORY",
]);

export const generateFormZ = z.object({
  imageType: aiImageTypeZ,
  productDescription: z.string().max(20_000).default(""),
  productColor: z.string().max(64).default("#ffffff"),
  productSize: z.string().max(500).default(""),
  mainAngle: z.string().max(64).optional(),
  mainLighting: z.string().max(64).optional(),
  lifestyleScene: z.string().max(64).optional(),
  lifestyleMood: z.string().max(64).optional(),
  lifestyleTime: z.string().max(64).optional(),
  lifestyleStyle: z.string().max(64).optional(),
  modelGender: z.string().max(32).optional(),
  modelAge: z.string().max(32).optional(),
  modelSkin: z.string().max(32).optional(),
  modelExpression: z.string().max(32).optional(),
  sellingPoints: z.array(z.string().max(200)).max(4).optional(),
  infographicPalette: z.string().max(64).optional(),
  infographicLayout: z.string().max(64).optional(),
  specPreset: z.enum(["amazon_1600", "custom"]).default("amazon_1600"),
  customWidth: z.number().int().min(256).max(4096).optional(),
  customHeight: z.number().int().min(256).max(4096).optional(),
  styleStrength: z.number().int().min(1).max(10).default(5),
  count: z.union([z.literal(1), z.literal(2), z.literal(4)]).default(2),
});

export type GenerateFormParsed = z.infer<typeof generateFormZ>;
