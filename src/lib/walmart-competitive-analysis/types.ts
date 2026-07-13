export type WalmartParsedUrl = {
  url: string;
  productId: string;
};

export type WalmartProductSnapshot = {
  productId: string;
  name: string;
  brand: string;
  category: string;
  price: number | null;
  rating: number | null;
  reviewCount: number | null;
  sellerName: string;
  raw: unknown;
};

export type GeneratedKeyword = {
  keyword: string;
  source: "title" | "category" | "attribute";
};

export type KeywordRanking = {
  keyword: string;
  rank: number | null;
  totalResults: number | null;
  matchedTitle: string;
  matchedProductId: string;
  raw: unknown;
};

export type ReviewRecord = {
  reviewId: string;
  title: string;
  text: string;
  rating: number | null;
  reviewer: string;
  reviewDate: string;
  raw: unknown;
};

export type TrendMetrics = {
  recent30dReviewCount: number;
  recent90dReviewCount: number;
  monthlyReviewSeries: Array<{ month: string; count: number }>;
  trendDirection: "up" | "flat" | "down";
};

export type SalesEstimate = {
  monthlySalesLow: number;
  monthlySalesHigh: number;
  /** 未解析到有效售价时为 null，避免误显示 $0 */
  monthlyRevenueLow: number | null;
  monthlyRevenueHigh: number | null;
  confidence: "low" | "medium" | "high";
  rationale: string[];
  risks: string[];
  modelDetail: {
    reviewCount: number;
    recent30dReviewCount: number;
    rankedKeywordsTop20: number;
    reviewDrivenBase: number;
    recentDrivenBase: number;
    rankMultiplier: number;
  };
};

export type SalesModelConfig = {
  reviewWeight: number;
  recent30dWeight: number;
  lowRangeFactor: number;
  highRangeFactor: number;
  rankMultiplierHigh: number;
  rankMultiplierMedium: number;
  rankMultiplierLow: number;
};

export type WalmartCompetitiveAnalysisResult = {
  product: WalmartProductSnapshot;
  keywords: GeneratedKeyword[];
  rankings: KeywordRanking[];
  reviews: ReviewRecord[];
  trend: TrendMetrics;
  estimate: SalesEstimate;
  modelConfig: SalesModelConfig;
};
