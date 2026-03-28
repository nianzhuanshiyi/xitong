/** 前端 / API 共用的 Listing 撰写类型 */

export type MarketplaceCode = "US" | "CA" | "UK" | "DE" | "JP" | "AU";

export type WritingStyle =
  | "professional"
  | "friendly"
  | "luxury"
  | "concise";

export type ListingGenerateFlags = {
  title: boolean;
  bullets: boolean;
  description: boolean;
  searchTerms: boolean;
  aplus: boolean;
};

export type ListingInputPayload = {
  marketplace: MarketplaceCode;
  category: string;
  productName: string;
  brandName: string;
  sellingPoints: string;
  specs: string;
  targetAudience: string;
  useCases: string;
  competitorAsins: string;
  style: WritingStyle;
  coreKeywords: string;
  bannedWords: string;
  extraNotes: string;
  /** 竞品分析原始摘要（卖家精灵 JSON 文本） */
  competitorContext?: string | null;
};

export type AplusBlocks = {
  brandStory: string;
  comparison: string;
  scenarios: string;
  faq: string;
};

/** Claude 输出解析后的结构 */
export type ListingResultPayload = {
  titles: [string, string, string];
  bullets: string[];
  productDescriptionHtml: string;
  searchTerms: string;
  aplus: AplusBlocks;
};

export const DEFAULT_GENERATE_FLAGS: ListingGenerateFlags = {
  title: true,
  bullets: true,
  description: true,
  searchTerms: true,
  aplus: true,
};

export const MARKETPLACE_OPTIONS: { value: MarketplaceCode; label: string }[] =
  [
    { value: "US", label: "美国" },
    { value: "CA", label: "加拿大" },
    { value: "UK", label: "英国" },
    { value: "DE", label: "德国" },
    { value: "JP", label: "日本" },
    { value: "AU", label: "澳洲" },
  ];

export const CATEGORY_OPTIONS = [
  "Beauty & Personal Care",
  "Hair Care",
  "Skin Care",
  "Outdoor",
  "Home & Kitchen",
  "Electronics",
  "Sports & Outdoors",
  "Toys & Games",
  "Pet Supplies",
  "Other",
] as const;

export const STYLE_OPTIONS: { value: WritingStyle; label: string }[] = [
  { value: "professional", label: "专业严谨" },
  { value: "friendly", label: "活泼亲切" },
  { value: "luxury", label: "高端奢华" },
  { value: "concise", label: "简洁直白" },
];
