/**
 * 智能选品 — 筛选条件 JSON 结构（与卖家精灵 product_research 参数对齐，部分字段待对接）
 */
export type SmartSelectionFilters = {
  salesPerformance: {
    monthlySalesMin: number | null;
    monthlySalesMax: number | null;
    monthlyRevenueMin: number | null;
    monthlyRevenueMax: number | null;
    childSalesMin: number | null;
    childSalesMax: number | null;
    monthlySalesGrowthMin: number | null;
    monthlySalesGrowthMax: number | null;
    bsrMin: number | null;
    bsrMax: number | null;
    subBsrMin: number | null;
    subBsrMax: number | null;
    bsrGrowthCountMin: number | null;
    bsrGrowthCountMax: number | null;
    bsrGrowthRateMin: number | null;
    bsrGrowthRateMax: number | null;
  };
  productInfo: {
    variantCountMin: number | null;
    variantCountMax: number | null;
    priceMin: number | null;
    priceMax: number | null;
    qaMin: number | null;
    qaMax: number | null;
    monthlyNewReviewsMin: number | null;
    monthlyNewReviewsMax: number | null;
    reviewRateMin: number | null;
    reviewRateMax: number | null;
    grossMarginMin: number | null;
    grossMarginMax: number | null;
    lqsMin: number | null;
    lqsMax: number | null;
    packageSize: string;
    lowPriceProduct: boolean;
    reviewCountMin: number | null;
    reviewCountMax: number | null;
    ratingMin: number | null;
    ratingMax: number | null;
    fbaFeeMin: number | null;
    fbaFeeMax: number | null;
    listingAge: string;
    packageWeightMin: number | null;
    packageWeightMax: number | null;
    buyerShippingMin: number | null;
    buyerShippingMax: number | null;
  };
  competitor: {
    sellerCountMin: number | null;
    sellerCountMax: number | null;
    sellerRegion: string;
    includeBrands: string;
    excludeBrands: string;
    includeSellers: string;
    excludeSellers: string;
    excludeKeywords: string;
    includeKeywords: string;
    includeKeywordMode: "fuzzy" | "phrase" | "exact";
    fulfillment: string[];
    mainImageVideo: "any" | "with" | "without";
    badges: string[];
  };
  /** 我们的开发标准（写入 Claude 评估 prompt） */
  devStandards: {
    minPriceUsd: number;
    requireReviewPainPoints: boolean;
    avoidBrandMonopoly: boolean;
    requireDifferentiationSpace: boolean;
    minProfitMarginPct: number;
    supplyChainNote: string;
  };
};

export const US_BEAUTY_DEFAULT_FILTERS: SmartSelectionFilters = {
  salesPerformance: {
    monthlySalesMin: 300,
    monthlySalesMax: null,
    monthlyRevenueMin: null,
    monthlyRevenueMax: null,
    childSalesMin: null,
    childSalesMax: null,
    monthlySalesGrowthMin: null,
    monthlySalesGrowthMax: null,
    bsrMin: 1000,
    bsrMax: 30000,
    subBsrMin: null,
    subBsrMax: null,
    bsrGrowthCountMin: null,
    bsrGrowthCountMax: null,
    bsrGrowthRateMin: null,
    bsrGrowthRateMax: null,
  },
  productInfo: {
    variantCountMin: null,
    variantCountMax: null,
    priceMin: 20,
    priceMax: 50,
    qaMin: null,
    qaMax: null,
    monthlyNewReviewsMin: null,
    monthlyNewReviewsMax: null,
    reviewRateMin: null,
    reviewRateMax: null,
    grossMarginMin: null,
    grossMarginMax: null,
    lqsMin: null,
    lqsMax: null,
    packageSize: "",
    lowPriceProduct: false,
    reviewCountMin: 50,
    reviewCountMax: 500,
    ratingMin: 4,
    ratingMax: null,
    fbaFeeMin: null,
    fbaFeeMax: null,
    listingAge: "1y",
    packageWeightMin: null,
    packageWeightMax: null,
    buyerShippingMin: null,
    buyerShippingMax: null,
  },
  competitor: {
    sellerCountMin: 1,
    sellerCountMax: 3,
    sellerRegion: "",
    includeBrands: "",
    excludeBrands: "",
    includeSellers: "",
    excludeSellers: "",
    excludeKeywords: "",
    includeKeywords: "",
    includeKeywordMode: "fuzzy",
    fulfillment: ["FBA"],
    mainImageVideo: "any",
    badges: [],
  },
  devStandards: {
    minPriceUsd: 15,
    requireReviewPainPoints: true,
    avoidBrandMonopoly: true,
    requireDifferentiationSpace: true,
    minProfitMarginPct: 20,
    supplyChainNote: "适合现有美妆相关供应链",
  },
};

export const EMPTY_FILTERS_PLACEHOLDER: SmartSelectionFilters = {
  salesPerformance: {
    monthlySalesMin: null,
    monthlySalesMax: null,
    monthlyRevenueMin: null,
    monthlyRevenueMax: null,
    childSalesMin: null,
    childSalesMax: null,
    monthlySalesGrowthMin: null,
    monthlySalesGrowthMax: null,
    bsrMin: null,
    bsrMax: null,
    subBsrMin: null,
    subBsrMax: null,
    bsrGrowthCountMin: null,
    bsrGrowthCountMax: null,
    bsrGrowthRateMin: null,
    bsrGrowthRateMax: null,
  },
  productInfo: {
    variantCountMin: null,
    variantCountMax: null,
    priceMin: null,
    priceMax: null,
    qaMin: null,
    qaMax: null,
    monthlyNewReviewsMin: null,
    monthlyNewReviewsMax: null,
    reviewRateMin: null,
    reviewRateMax: null,
    grossMarginMin: null,
    grossMarginMax: null,
    lqsMin: null,
    lqsMax: null,
    packageSize: "",
    lowPriceProduct: false,
    reviewCountMin: null,
    reviewCountMax: null,
    ratingMin: null,
    ratingMax: null,
    fbaFeeMin: null,
    fbaFeeMax: null,
    listingAge: "",
    packageWeightMin: null,
    packageWeightMax: null,
    buyerShippingMin: null,
    buyerShippingMax: null,
  },
  competitor: {
    sellerCountMin: null,
    sellerCountMax: null,
    sellerRegion: "",
    includeBrands: "",
    excludeBrands: "",
    includeSellers: "",
    excludeSellers: "",
    excludeKeywords: "",
    includeKeywords: "",
    includeKeywordMode: "fuzzy",
    fulfillment: [],
    mainImageVideo: "any",
    badges: [],
  },
  devStandards: {
    minPriceUsd: 15,
    requireReviewPainPoints: true,
    avoidBrandMonopoly: true,
    requireDifferentiationSpace: true,
    minProfitMarginPct: 20,
    supplyChainNote: "",
  },
};

export function parseFiltersJson(
  raw: string,
  base: SmartSelectionFilters = US_BEAUTY_DEFAULT_FILTERS
): SmartSelectionFilters {
  try {
    const j = JSON.parse(raw) as Partial<SmartSelectionFilters>;
    return {
      ...base,
      ...j,
      salesPerformance: {
        ...base.salesPerformance,
        ...j.salesPerformance,
      },
      productInfo: {
        ...base.productInfo,
        ...j.productInfo,
      },
      competitor: {
        ...base.competitor,
        ...j.competitor,
        fulfillment:
          j.competitor?.fulfillment ?? base.competitor.fulfillment,
        badges: j.competitor?.badges ?? base.competitor.badges,
      },
      devStandards: {
        ...base.devStandards,
        ...j.devStandards,
      },
    };
  } catch {
    return { ...base };
  }
}

export function estimateScanTokens(filters: SmartSelectionFilters): {
  pullCount: number;
  aiDeepCount: number;
  tokensApprox: number;
} {
  void filters;
  const pullCount = 100;
  const aiDeepCount = 10;
  const tokensApprox = pullCount * 50 + aiDeepCount * 3500;
  return { pullCount, aiDeepCount, tokensApprox };
}
