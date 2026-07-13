const SEARCH_API_BASE_URL = "https://www.searchapi.io/api/v1/search";
const REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;

function getSearchApiKey(): string {
  const key = process.env.SEARCHAPI_API_KEY?.trim();
  if (!key) {
    throw new Error("未配置 SEARCHAPI_API_KEY");
  }
  return key;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyErrorMessage(status: number, fallback: string): string {
  if (status === 401 || status === 403) return "SearchAPI Key 无效或无权限";
  if (status === 429) return "SearchAPI 请求过于频繁，请稍后重试";
  if (status >= 500) return "SearchAPI 服务暂时不可用，请稍后重试";
  return fallback;
}

async function searchApiRequest(params: Record<string, string | number>) {
  const key = getSearchApiKey();
  const url = new URL(SEARCH_API_BASE_URL);
  url.searchParams.set("api_key", key);
  Object.entries(params).forEach(([k, v]) => {
    url.searchParams.set(k, String(v));
  });

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const fallback =
          typeof data.error === "string" ? data.error : `SearchAPI 请求失败: ${res.status}`;
        const errMsg = classifyErrorMessage(res.status, fallback);
        // 4xx（除 429）直接失败，不重试
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          throw new Error(errMsg);
        }
        throw new Error(errMsg);
      }
      clearTimeout(timeout);
      return data;
    } catch (e) {
      clearTimeout(timeout);
      const err =
        e instanceof Error ? e : new Error("SearchAPI 请求异常");
      lastError = err;
      const isAbort = err.name === "AbortError";
      const shouldRetry = attempt < MAX_RETRIES;
      if (!shouldRetry) break;
      if (isAbort || /频繁|暂时不可用|异常|超时/i.test(err.message)) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      break;
    }
  }
  if (lastError) throw lastError;
  throw new Error("SearchAPI 请求失败");
}

export async function fetchWalmartProductById(productId: string) {
  return searchApiRequest({
    engine: "walmart_product",
    product_id: productId,
  });
}

export async function fetchWalmartSearchResult(keyword: string, page = 1) {
  return searchApiRequest({
    engine: "walmart_search",
    q: keyword,
    page,
  });
}

export async function fetchWalmartReviews(productId: string, page = 1) {
  return searchApiRequest({
    engine: "walmart_reviews",
    product_id: productId,
    page,
  });
}
