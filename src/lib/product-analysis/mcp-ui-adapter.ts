/** 从卖家精灵 MCP 返回的松散 JSON 中提取 UI 所需结构（多字段名兼容） */

export type MarketSize = {
  monthlySalesUsd: number | null;
  monthlyUnits: number | null;
};

export type CategoryInfo = {
  name: string | null;
  path: string | null;
};

export type TopProductRow = {
  rank: number;
  image: string | null;
  asin: string;
  title: string;
  price: number | null;
  rating: number | null;
  reviews: number | null;
  monthlySales: number | null;
};

export type KeywordRow = {
  keyword: string;
  searchVolume: number | null;
  competition: string | number | null;
  rank: number | null;
};

export type PieSlice = { name: string; value: number };

export type TrafficSplit = { organic: number; paid: number };

export type TrendPoint = { label: string; value: number };

export type ReviewAggregate = {
  good: number;
  bad: number;
  starBuckets: { star: number; count: number }[];
  negativeKeywords: string[];
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.-]/g, ""));
    if (!Number.isNaN(n) && Number.isFinite(n)) return n;
  }
  return null;
}

function toStr(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/** 深度遍历，收集所有对象供字段匹配 */
function walk(
  obj: unknown,
  visit: (o: Record<string, unknown>, path: string) => void,
  depth = 0,
  path = ""
): void {
  if (depth > 16 || obj == null) return;
  if (Array.isArray(obj)) {
    obj.forEach((x, i) => walk(x, visit, depth + 1, `${path}[${i}]`));
    return;
  }
  if (!isRecord(obj)) return;
  visit(obj, path);
  for (const [k, v] of Object.entries(obj)) {
    walk(v, visit, depth + 1, path ? `${path}.${k}` : k);
  }
}

function firstNumInObject(
  o: Record<string, unknown>,
  keyRe: RegExp
): number | null {
  for (const [k, v] of Object.entries(o)) {
    if (keyRe.test(k)) {
      const n = toNum(v);
      if (n != null) return n;
    }
  }
  return null;
}

const SALES_USD_RE =
  /^(month(ly)?(sales|revenue)|sales(revenue)?|totalSales|marketSales|gmv|revenue|avgRevenue|monthlySales|monthSales|saleAmount|销售额|月销售额)$/i;
const UNITS_RE =
  /^(month(ly)?(units|volume|qty|quantity)|salesVolume|sold|月销量|销量|unitsSold|orderCount)$/i;

export function extractMarketSize(research: unknown): MarketSize {
  let monthlySalesUsd: number | null = null;
  let monthlyUnits: number | null = null;
  walk(research, (o) => {
    if (monthlySalesUsd == null) {
      const n = firstNumInObject(o, SALES_USD_RE);
      if (n != null && n >= 0) monthlySalesUsd = n;
    }
    if (monthlyUnits == null) {
      const n = firstNumInObject(o, UNITS_RE);
      if (n != null && n >= 0) monthlyUnits = Math.round(n);
    }
  });
  return { monthlySalesUsd, monthlyUnits };
}

const CAT_NAME_RE =
  /^(categoryName|nodeName|name|title|类目|category|browseNodeName)$/i;
const CAT_PATH_RE =
  /^(categoryPath|path|breadcrumb|fullPath|nodePath|类目路径)$/i;

export function extractCategoryInfo(research: unknown): CategoryInfo {
  let name: string | null = null;
  let path: string | null = null;
  walk(research, (o) => {
    if (name == null) {
      for (const [k, v] of Object.entries(o)) {
        if (CAT_NAME_RE.test(k)) {
          const s = toStr(v);
          if (s && s.length < 500) name = s;
        }
      }
    }
    if (path == null) {
      for (const [k, v] of Object.entries(o)) {
        if (CAT_PATH_RE.test(k)) {
          if (Array.isArray(v)) {
            const parts = v
              .map((x) => {
                if (isRecord(x))
                  return toStr(x.name) ?? toStr(x.label) ?? toStr(x.title);
                return toStr(x);
              })
              .filter(Boolean) as string[];
            if (parts.length) path = parts.join(" › ");
          } else {
            const s = toStr(v);
            if (s && s.length < 2000) path = s;
          }
        }
      }
    }
  });
  return { name, path };
}

function rowHasAsin(x: unknown): boolean {
  if (!isRecord(x)) return false;
  return Boolean(
    x.asin ??
      x.ASIN ??
      x.asinCode ??
      (typeof x.productId === "string" && /^B[0-9A-Z]{9}$/i.test(x.productId))
  );
}

function scoreProductArray(arr: unknown[]): number {
  if (!arr.length || arr.length > 300) return -1;
  const sample = arr.slice(0, Math.min(8, arr.length));
  let s = 0;
  for (const x of sample) {
    if (rowHasAsin(x)) s += 4;
    if (isRecord(x) && (x.title || x.productTitle || x.name)) s += 2;
  }
  return s;
}

function findBestProductArray(root: unknown): unknown[] {
  let best: unknown[] = [];
  let bestScore = 0;
  walk(root, (o) => {
    for (const v of Object.values(o)) {
      if (!Array.isArray(v) || v.length === 0) continue;
      const sc = scoreProductArray(v);
      if (sc > bestScore) {
        bestScore = sc;
        best = v;
      }
    }
  });
  return bestScore >= 4 ? best : [];
}

function pickAsin(o: Record<string, unknown>): string {
  const a =
    o.asin ??
    o.ASIN ??
    o.asinCode ??
    (typeof o.productId === "string" ? o.productId : null);
  const s = toStr(a) ?? "";
  const m = s.match(/B[0-9A-Z]{9}/i);
  return m ? m[0].toUpperCase() : s.slice(0, 20) || "—";
}

function pickTitle(o: Record<string, unknown>): string {
  return (
    toStr(o.title) ??
    toStr(o.productTitle) ??
    toStr(o.name) ??
    toStr(o.itemName) ??
    "—"
  );
}

function pickImage(o: Record<string, unknown>): string | null {
  const candidates = [
    o.image,
    o.imageUrl,
    o.mainImage,
    o.img,
    o.picUrl,
    o.thumbnail,
  ];
  for (const c of candidates) {
    const s = toStr(c);
    if (s && /^https?:\/\//i.test(s)) return s;
  }
  if (isRecord(o.image) && typeof o.image === "object") {
    const im = o.image as Record<string, unknown>;
    return pickImage(im);
  }
  return null;
}

export function extractTopProducts(research: unknown, limit = 10): TopProductRow[] {
  const arr = findBestProductArray(research);
  const rows: TopProductRow[] = [];
  let rank = 0;
  for (const x of arr) {
    if (!isRecord(x)) continue;
    rank += 1;
    if (rank > limit) break;
    const price =
      toNum(x.price) ??
      toNum(x.currentPrice) ??
      toNum(x.salePrice) ??
      guessPriceFromLoose(x);
    const rating =
      toNum(x.rating) ??
      toNum(x.stars) ??
      toNum(x.starRating) ??
      toNum(x.avgRating);
    const reviews =
      toNum(x.reviews) ??
      toNum(x.reviewCount) ??
      toNum(x.ratingsCount) ??
      toNum(x.ratingsTotal);
    const monthlySales =
      toNum(x.monthlySales) ??
      toNum(x.sales) ??
      toNum(x.monthSales) ??
      toNum(x.unitsSold);
    rows.push({
      rank,
      image: pickImage(x),
      asin: pickAsin(x),
      title: pickTitle(x),
      price,
      rating,
      reviews,
      monthlySales,
    });
  }
  return rows;
}

function guessPriceFromLoose(o: Record<string, unknown>): number | null {
  for (const [k, v] of Object.entries(o)) {
    if (/price|售价/i.test(k) && typeof v === "object" && v) {
      const n = toNum((v as Record<string, unknown>).value ?? v);
      if (n != null) return n;
    }
  }
  return null;
}

const KW_RE =
  /^(keyword|searchTerm|word|query|keyWord|searchWord|关键词)$/i;
const VOL_RE =
  /^(searchVolume|volume|searches|monthlySearch|流量|搜索量|est.*vol)/i;
const COMP_RE = /^(competition|competitive|竞争|kc|difficulty|竞品)/i;
const RANK_RE = /^(rank|ranking|organicRank|自然排名|排名)$/i;

function scoreKeywordArray(arr: unknown[]): number {
  if (!arr.length || arr.length > 500) return -1;
  let s = 0;
  for (const x of arr.slice(0, 5)) {
    if (!isRecord(x)) continue;
    if (Object.keys(x).some((k) => KW_RE.test(k))) s += 3;
  }
  return s;
}

function findBestKeywordArray(root: unknown): unknown[] {
  let best: unknown[] = [];
  let bestScore = 0;
  walk(root, (o) => {
    for (const v of Object.values(o)) {
      if (!Array.isArray(v)) continue;
      const sc = scoreKeywordArray(v);
      if (sc > bestScore) {
        bestScore = sc;
        best = v;
      }
    }
  });
  return bestScore >= 2 ? best : [];
}

export function extractKeywordRows(keywordData: unknown, limit = 20): KeywordRow[] {
  const arr = findBestKeywordArray(keywordData);
  const rows: KeywordRow[] = [];
  for (const x of arr) {
    if (!isRecord(x)) continue;
    let kw: string | null = null;
    for (const [k, v] of Object.entries(x)) {
      if (KW_RE.test(k)) {
        kw = toStr(v);
        if (kw) break;
      }
    }
    if (!kw) continue;
    let searchVolume: number | null = null;
    for (const [k, v] of Object.entries(x)) {
      if (VOL_RE.test(k)) {
        searchVolume = toNum(v);
        if (searchVolume != null) break;
      }
    }
    let competition: string | number | null = null;
    for (const [k, v] of Object.entries(x)) {
      if (COMP_RE.test(k)) {
        competition = typeof v === "number" ? v : toStr(v) ?? toNum(v);
        if (competition != null) break;
      }
    }
    let rank: number | null = null;
    for (const [k, v] of Object.entries(x)) {
      if (RANK_RE.test(k)) {
        rank = toNum(v);
        if (rank != null) break;
      }
    }
    rows.push({ keyword: kw, searchVolume, competition, rank });
    if (rows.length >= limit) break;
  }
  return rows;
}

/** 品牌/卖家集中度 → 饼图数据 */
export function concentrationToPie(data: unknown, label = "其他"): PieSlice[] {
  const slices: PieSlice[] = [];
  const add = (name: string, value: number) => {
    if (value > 0 && name) slices.push({ name, value });
  };

  const visitObj = (o: Record<string, unknown>) => {
    const name =
      toStr(o.brand) ??
      toStr(o.brandName) ??
      toStr(o.seller) ??
      toStr(o.sellerName) ??
      toStr(o.name) ??
      toStr(o.label);
    const pctRaw =
      toNum(o.percent) ??
      toNum(o.percentage) ??
      toNum(o.share) ??
      toNum(o.ratio) ??
      toNum(o.concentration);
    const cnt = toNum(o.count) ?? toNum(o.sales) ?? toNum(o.volume);
    if (name && pctRaw != null && pctRaw > 0) {
      let pct = pctRaw;
      if (pct <= 1 && pct > 0) pct *= 100;
      add(name, pct);
    } else if (name && cnt != null && cnt > 0) add(name, cnt);
  };

  if (Array.isArray(data)) {
    for (const x of data) {
      if (isRecord(x)) visitObj(x);
    }
  } else if (isRecord(data)) {
    for (const v of Object.values(data)) {
      if (Array.isArray(v)) {
        for (const x of v) {
          if (isRecord(x)) visitObj(x);
        }
      }
    }
  }

  if (slices.length === 0) return [];
  const sum = slices.reduce((a, b) => a + b.value, 0);
  if (sum <= 0) return [];
  if (sum > 100.5) {
    return slices.slice(0, 12);
  }
  const rest = 100 - sum;
  if (rest > 0.5) slices.push({ name: label, value: Math.max(0, rest) });
  return slices.slice(0, 12);
}

export function extractTrafficSplit(
  source: unknown,
  listing: unknown
): TrafficSplit | null {
  let best: TrafficSplit | null = null;

  const tryPair = (o: Record<string, unknown>) => {
    if (best) return;
    let on =
      toNum(o.organic) ??
      toNum(o.organicTraffic) ??
      toNum(o.organicPercent) ??
      toNum(o.naturalTraffic) ??
      toNum(o.organicRatio);
    let pd =
      toNum(o.paid) ??
      toNum(o.paidTraffic) ??
      toNum(o.paidPercent) ??
      toNum(o.adTraffic) ??
      toNum(o.paidRatio);
    if (on == null && pd == null) return;
    if (on != null && on > 0 && on <= 1) on *= 100;
    if (pd != null && pd > 0 && pd <= 1) pd *= 100;
    if (on != null && pd == null) pd = Math.max(0, 100 - on);
    if (pd != null && on == null) on = Math.max(0, 100 - pd);
    if (on == null || pd == null) return;
    if (on + pd > 105) return;
    best = { organic: on, paid: pd };
  };

  walk(source, tryPair);
  if (!best) walk(listing, tryPair);
  return best;
}

export function extractTrafficTrendSeries(
  listing: unknown,
  googleTrend: unknown,
  chartBsr: { date: string; value: number }[],
  chartPrice: { date: string; value: number }[]
): TrendPoint[] {
  const points: TrendPoint[] = [];
  const fromTrend = (root: unknown) => {
    walk(root, (o) => {
      const t =
        toStr(o.date) ?? toStr(o.time) ?? toStr(o.week) ?? toStr(o.month);
      const val =
        toNum(o.value) ??
        toNum(o.score) ??
        toNum(o.traffic) ??
        toNum(o.index) ??
        toNum(o.ratio);
      if (t && val != null) points.push({ label: t, value: val });
    });
  };
  fromTrend(listing);
  fromTrend(googleTrend);
  if (points.length >= 3) {
    return points.slice(-40);
  }
  if (chartPrice.length >= 2) {
    return chartPrice.map((p) => ({
      label: p.date,
      value: p.value,
    }));
  }
  if (chartBsr.length >= 2) {
    return chartBsr.map((p) => ({
      label: p.date,
      value: p.value,
    }));
  }
  return points.slice(-40);
}

function harvestReviewFromObject(
  o: Record<string, unknown>,
  acc: {
    good: number;
    bad: number;
    starMap: Map<number, number>;
    negWords: string[];
  }
) {
  const bumpStar = (star: number, n: number) => {
    if (star < 1 || star > 5) return;
    acc.starMap.set(star, (acc.starMap.get(star) ?? 0) + n);
  };

  const pos =
    toNum(o.positiveCount) ??
    toNum(o.goodCount) ??
    toNum(o.positiveReviews) ??
    toNum(o.fiveStar);
  const neg =
    toNum(o.negativeCount) ??
    toNum(o.badCount) ??
    toNum(o.negativeReviews) ??
    toNum(o.oneStar);
  if (pos != null) acc.good += pos;
  if (neg != null) acc.bad += neg;

  for (let s = 1; s <= 5; s++) {
    const n = toNum(o[`star${s}`]) ?? toNum(o[`${s}Star`]);
    if (n != null) bumpStar(s, n);
  }
  const dist = o.ratingDistribution ?? o.starDistribution ?? o.ratings;
  if (Array.isArray(dist)) {
    for (const x of dist) {
      if (!isRecord(x)) continue;
      const star =
        toNum(x.star) ?? toNum(x.rating) ?? toNum(x.stars) ?? toNum(x.level);
      const cnt =
        toNum(x.count) ?? toNum(x.num) ?? toNum(x.value) ?? toNum(x.percent);
      if (star != null && cnt != null && star >= 1 && star <= 5) {
        bumpStar(Math.round(star), cnt);
      }
    }
  }

  const phrases = o.negativeKeywords ?? o.badKeywords ?? o.cons ?? o.painPoints;
  if (Array.isArray(phrases)) {
    for (const p of phrases) {
      if (isRecord(p) && toStr(p.point)) acc.negWords.push(toStr(p.point)!);
      else {
        const s = toStr(p);
        if (s) acc.negWords.push(s);
      }
    }
  }
}

export function aggregateReviews(byAsin: Record<string, unknown>): ReviewAggregate {
  const acc = {
    good: 0,
    bad: 0,
    starMap: new Map<number, number>(),
    negWords: [] as string[],
  };

  for (const v of Object.values(byAsin)) {
    walk(v, (o) => harvestReviewFromObject(o, acc), 0, "");
  }

  let good = acc.good;
  let bad = acc.bad;
  const starMap = acc.starMap;

  if (good === 0 && bad === 0) {
    let totalStars = 0;
    starMap.forEach((c, s) => {
      if (s >= 4) good += c;
      else if (s <= 2) bad += c;
      totalStars += c;
    });
    if (totalStars > 0 && good === 0 && bad === 0) {
      good = Math.round(totalStars * 0.85);
      bad = totalStars - good;
    }
  }

  const starBuckets = [1, 2, 3, 4, 5].map((star) => ({
    star,
    count: starMap.get(star) ?? 0,
  }));

  return {
    good,
    bad,
    starBuckets,
    negativeKeywords: acc.negWords.slice(0, 30),
  };
}

export function formatUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

export function formatInt(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("zh-CN");
}
