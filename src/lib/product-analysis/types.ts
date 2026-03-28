import type { ParsedAsinInput } from "@/lib/asin-parser";

export type ScoreBand = "strong" | "moderate" | "careful" | "avoid";

export type AnalysisResult = {
  parsed: ParsedAsinInput;
  basics: {
    byAsin: Record<string, unknown>;
    errors: Record<string, string>;
    lowPriceWarnings: string[];
  };
  traffic: {
    keyword: unknown;
    source: unknown;
    listing: unknown;
    errors: string[];
  };
  reviews: {
    byAsin: Record<string, unknown>;
    errors: Record<string, string>;
  };
  market: {
    research: unknown;
    brandConc: unknown;
    sellerConc: unknown;
    listingDateDist: unknown;
    priceDist: unknown;
    errors: string[];
  };
  profit: {
    assumptions: {
      sellingPrice: number;
      purchaseCost: number;
      firstMile: number;
      fbaEstimate: number;
      referralPct: number;
      adPct: number;
      returnPct: number;
    };
    breakdown: {
      referralFee: number;
      adCost: number;
      returnCost: number;
      netProfit: number;
      marginPct: number;
    };
    scenarios: Array<{ label: string; sellingPrice: number; netProfit: number; marginPct: number }>;
    breakEvenUnitsHint?: string;
  };
  trends: {
    keepa: unknown;
    googleTrend: unknown;
    prediction: unknown;
    chartBsr: { date: string; value: number }[];
    chartPrice: { date: string; value: number }[];
    errors: string[];
  };
  score: {
    total: number;
    band: ScoreBand;
    label: string;
    dimensions: {
      marketSpace: number;
      competition: number;
      profit: number;
      differentiation: number;
      barrier: number;
    };
    rationale: string;
  };
  ai: {
    painPoints: Array<{ point: string; severity?: string; frequency?: string }>;
    reviewSummary: string;
    reportMarkdown: string;
    differentiators: string[];
    factorySpecMarkdown: string;
    competitorTableMarkdown: string;
  };
};

export type StreamProgressEvent = {
  type: "progress";
  step: string;
  label: string;
  percent: number;
};

export type StreamErrorEvent = { type: "error"; message: string };

export type StreamCompleteEvent = {
  type: "complete";
  reportId: string | null;
  result: AnalysisResult;
  fromCache?: boolean;
  cacheMeta?: {
    updatedAt: string;
    analystLabel: string;
  };
};

export type StreamEvent =
  | StreamProgressEvent
  | StreamErrorEvent
  | StreamCompleteEvent;
