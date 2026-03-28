export const AI_IMAGE_TYPE_VALUES = [
  "MAIN_WHITE",
  "LIFESTYLE",
  "INFOGRAPHIC",
  "SIZE_COMPARE",
  "MODEL_USE",
  "BEFORE_AFTER",
  "PACKAGING",
  "APLUS_STORY",
] as const;

export type AiImageTypeId = (typeof AI_IMAGE_TYPE_VALUES)[number];

export type BundleSlot = {
  slot: number;
  title: string;
  imageType: AiImageTypeId;
  hintZh: string;
};

export type GenerateFormState = {
  imageType: AiImageTypeId;
  productDescription: string;
  productColor: string;
  productSize: string;
  mainAngle?: string;
  mainLighting?: string;
  lifestyleScene?: string;
  lifestyleMood?: string;
  lifestyleTime?: string;
  lifestyleStyle?: string;
  modelGender?: string;
  modelAge?: string;
  modelSkin?: string;
  modelExpression?: string;
  sellingPoints?: string[];
  infographicPalette?: string;
  infographicLayout?: string;
  specPreset: "amazon_1600" | "custom";
  customWidth?: number;
  customHeight?: number;
  styleStrength: number;
  count: 1 | 2 | 4;
};

export const DEFAULT_FORM: GenerateFormState = {
  imageType: "MAIN_WHITE",
  productDescription: "",
  productColor: "#ffffff",
  productSize: "",
  mainAngle: "front",
  mainLighting: "soft",
  lifestyleScene: "living_room",
  lifestyleMood: "warm",
  lifestyleTime: "day",
  lifestyleStyle: "minimal",
  modelGender: "any",
  modelAge: "20-30",
  modelSkin: "any",
  modelExpression: "natural",
  sellingPoints: ["", "", "", ""],
  infographicPalette: "brand",
  infographicLayout: "left_image",
  specPreset: "amazon_1600",
  customWidth: 1600,
  customHeight: 1600,
  styleStrength: 5,
  count: 2,
};
