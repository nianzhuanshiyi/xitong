/**
 * Etsy 选品工具 — 基于 Etsy Open API v3
 *
 * 使用官方 API 搜索商品，无需爬虫，稳定可靠。
 * 需要在 .env.local 中配置 ETSY_API_KEY（keystring）。
 * 注册地址：https://www.etsy.com/developers
 */

export type EtsyProductRaw = {
  listingId: string;
  url: string;
  title: string;
  price: number | null;
  currencyCode: string | null;
  shopName: string;
  shopUrl: string | null;
  shopSales: number | null;
  favoriteCount: number | null;
  reviewCount: number | null;
  rating: number | null;
  tags: string[];
  imageUrl: string | null;
};

export type EtsyScrapeOptions = {
  keyword: string;
  maxPages?: number; // default 3, each page = 25 results (API limit 100/page)
  minShopSales?: number;
  minReviews?: number;
  minRating?: number;
  minPrice?: number;
  maxPrice?: number;
};

const ETSY_API_BASE = "https://openapi.etsy.com/v3/application";
const PAGE_SIZE = 100; // max per request

function apiHeaders(): HeadersInit {
  const key = process.env.ETSY_API_KEY;
  if (!key) throw new Error("ETSY_API_KEY 未配置，请在 .env.local 中添加");
  return {
    "x-api-key": key,
    Accept: "application/json",
  };
}

/** 将 USD cents -> dollars（Etsy API 价格单位为 float，已是美元） */
function parsePrice(amount: unknown, divisor: unknown): number | null {
  if (typeof amount === "number" && typeof divisor === "number" && divisor > 0) {
    return amount / divisor;
  }
  if (typeof amount === "number") return amount;
  return null;
}

type EtsyApiListing = {
  listing_id: number;
  title: string;
  url: string;
  price?: { amount: number; divisor: number; currency_code: string };
  shop_id?: number;
  shop?: {
    shop_name: string;
    url: string;
    transaction_sold_count?: number;
    sale_message?: string;
  };
  num_favorers?: number;
  views?: number;
  rating?: number;
  rating_count?: number;
  tags?: string[];
  images?: Array<{ url_570xN?: string; url_fullxfull?: string }>;
  // findAllListingsActive returns these via includes
  MainImage?: { url_570xN?: string };
};

/** 调用 GET /application/listings/active 搜索商品 */
async function fetchListingsPage(
  keyword: string,
  offset: number,
  minPrice?: number,
  maxPrice?: number
): Promise<{ results: EtsyApiListing[]; count: number }> {
  const params = new URLSearchParams({
    keywords: keyword,
    limit: String(PAGE_SIZE),
    offset: String(offset),
    sort_on: "score",
    includes: "Images,Shop",
  });
  if (minPrice != null) params.set("min_price", String(minPrice));
  if (maxPrice != null) params.set("max_price", String(maxPrice));

  const url = `${ETSY_API_BASE}/listings/active?${params}`;
  const res = await fetch(url, {
    headers: apiHeaders(),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Etsy API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json() as { results?: EtsyApiListing[]; count?: number };
  return {
    results: data.results ?? [],
    count: data.count ?? 0,
  };
}

/** 获取店铺销量（transaction_sold_count 来自 includes=Shop） */
function extractShopSales(listing: EtsyApiListing): number | null {
  return listing.shop?.transaction_sold_count ?? null;
}

/** 提取主图 URL */
function extractImageUrl(listing: EtsyApiListing): string | null {
  if (Array.isArray(listing.images) && listing.images.length > 0) {
    return listing.images[0].url_570xN ?? listing.images[0].url_fullxfull ?? null;
  }
  return listing.MainImage?.url_570xN ?? null;
}

/** 将 API listing 转换为内部格式 */
function mapListing(listing: EtsyApiListing): EtsyProductRaw {
  const price = parsePrice(listing.price?.amount, listing.price?.divisor);
  const currencyCode = listing.price?.currency_code ?? null;
  const shopName = listing.shop?.shop_name ?? "Unknown";
  const shopUrl = listing.shop?.url ?? null;
  const shopSales = extractShopSales(listing);
  const imageUrl = extractImageUrl(listing);

  return {
    listingId: String(listing.listing_id),
    url: listing.url ?? `https://www.etsy.com/listing/${listing.listing_id}`,
    title: listing.title ?? "",
    price,
    currencyCode,
    shopName,
    shopUrl,
    shopSales,
    favoriteCount: listing.num_favorers ?? null,
    reviewCount: listing.rating_count ?? null,
    rating: listing.rating ?? null,
    tags: listing.tags ?? [],
    imageUrl,
  };
}

/**
 * 主函数：通过 Etsy Open API v3 搜索商品
 */
export async function searchEtsy(
  options: EtsyScrapeOptions,
  onProgress?: (msg: string) => void
): Promise<EtsyProductRaw[]> {
  const {
    keyword,
    maxPages = 3,
    minShopSales,
    minReviews,
    minRating,
    minPrice,
    maxPrice,
  } = options;

  const log = (msg: string) => onProgress?.(msg);
  const allProducts: Map<string, EtsyProductRaw> = new Map();

  log(`开始通过 Etsy API 搜索: "${keyword}"`);

  for (let page = 0; page < maxPages; page++) {
    const offset = page * PAGE_SIZE;
    log(`获取第 ${page + 1}/${maxPages} 页 (offset=${offset})…`);

    try {
      const { results, count } = await fetchListingsPage(keyword, offset, minPrice, maxPrice);
      log(`第 ${page + 1} 页获取到 ${results.length} 个商品（总计 ${count}）`);

      for (const listing of results) {
        const p = mapListing(listing);
        if (!allProducts.has(p.listingId)) {
          allProducts.set(p.listingId, p);
        }
      }

      // 如果已取完全部结果，提前结束
      if (offset + results.length >= count || results.length < PAGE_SIZE) {
        log(`已取完所有结果，共 ${allProducts.size} 个`);
        break;
      }

      // API 速率限制：最多 10 req/s，稍作延迟
      if (page < maxPages - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (e) {
      log(`第 ${page + 1} 页请求出错: ${e instanceof Error ? e.message : "未知错误"}`);
      break;
    }
  }

  log(`共获取 ${allProducts.size} 个不重复商品，开始筛选…`);

  // 应用过滤条件
  const filtered = Array.from(allProducts.values()).filter((p) => {
    if (minShopSales != null && (p.shopSales == null || p.shopSales < minShopSales)) return false;
    if (minReviews != null && (p.reviewCount == null || p.reviewCount < minReviews)) return false;
    if (minRating != null && (p.rating == null || p.rating < minRating)) return false;
    return true;
  });

  // 按店铺销量降序，再按评论数降序
  filtered.sort((a, b) => {
    const sa = a.shopSales ?? -1;
    const sb = b.shopSales ?? -1;
    if (sb !== sa) return sb - sa;
    return (b.reviewCount ?? -1) - (a.reviewCount ?? -1);
  });

  log(`筛选后剩余 ${filtered.length} 个商品`);
  return filtered;
}
