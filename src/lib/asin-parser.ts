/** Amazon ASIN：10 位字母数字，常以大写 B 开头 */
const ASIN_REGEX = /\b([B][0-9A-Z]{9})\b/gi;

const DOMAIN_MARKET: { test: RegExp; code: string; label: string }[] = [
  { test: /amazon\.com\/(dp|gp|d)\b/i, code: "US", label: "美国" },
  { test: /amazon\.com\.(mx|br)/i, code: "US", label: "美洲" },
  { test: /amazon\.ca\b/i, code: "CA", label: "加拿大" },
  { test: /amazon\.co\.uk\b/i, code: "UK", label: "英国" },
  { test: /amazon\.de\b/i, code: "DE", label: "德国" },
  { test: /amazon\.fr\b/i, code: "FR", label: "法国" },
  { test: /amazon\.it\b/i, code: "IT", label: "意大利" },
  { test: /amazon\.es\b/i, code: "ES", label: "西班牙" },
  { test: /amazon\.nl\b/i, code: "NL", label: "荷兰" },
  { test: /amazon\.se\b/i, code: "SE", label: "瑞典" },
  { test: /amazon\.pl\b/i, code: "PL", label: "波兰" },
  { test: /amazon\.co\.jp\b/i, code: "JP", label: "日本" },
  { test: /amazon\.in\b/i, code: "IN", label: "印度" },
  { test: /amazon\.com\.au\b/i, code: "AU", label: "澳大利亚" },
  { test: /amazon\.ae\b/i, code: "AE", label: "阿联酋" },
];

function normalizeAsin(s: string): string | null {
  const t = s.trim().toUpperCase();
  if (!/^[B][0-9A-Z]{9}$/.test(t)) return null;
  return t;
}

/** 从亚马逊商品路径提取 ASIN：/dp/B…、/gp/product/B…、/d/B…（后跟 / ? # & 或行尾） */
const ASIN_IN_PATH_RES = [
  /\/dp\/(B[0-9A-Z]{9})(?=[/?#&]|$)/gi,
  /\/gp\/product\/(B[0-9A-Z]{9})(?=[/?#&]|$)/gi,
  /\/d\/(B[0-9A-Z]{9})(?=[/?#&]|$)/gi,
] as const;

function extractAsinsFromLine(line: string): string[] {
  const found = new Set<string>();

  for (const pattern of ASIN_IN_PATH_RES) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const a = normalizeAsin(m[1]);
      if (a) found.add(a);
    }
  }

  let m: RegExpExecArray | null;
  const wordRe = new RegExp(ASIN_REGEX.source, ASIN_REGEX.flags);
  while ((m = wordRe.exec(line)) !== null) {
    const a = normalizeAsin(m[1]);
    if (a) found.add(a);
  }

  return Array.from(found);
}

function detectMarketFromText(text: string): { code: string; label: string } | null {
  for (const { test, code, label } of DOMAIN_MARKET) {
    if (test.test(text)) return { code, label };
  }
  return null;
}

export type ParsedAsinInput = {
  asins: string[];
  marketplace: string;
  marketplaceLabel: string;
  warnings: string[];
};

/**
 * 多行输入，每行可含 ASIN、亚马逊链接或纯 ASIN。
 * 站点：从首个可识别的链接域名推断，否则默认 US。
 */
export function parseAsinInput(raw: string): ParsedAsinInput {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const asins: string[] = [];
  const seen = new Set<string>();
  let detected: { code: string; label: string } | null = null;

  for (const line of lines) {
    if (!detected) detected = detectMarketFromText(line);
    for (const a of extractAsinsFromLine(line)) {
      if (!seen.has(a)) {
        seen.add(a);
        asins.push(a);
      }
    }
  }

  const warnings: string[] = [];
  if (asins.length > 20) {
    warnings.push("已截取前 20 个 ASIN 进行分析");
  }
  const sliced = asins.slice(0, 20);

  const marketplace = detected?.code ?? "US";
  const marketplaceLabel = detected?.label ?? "美国（默认）";

  return {
    asins: sliced,
    marketplace,
    marketplaceLabel,
    warnings,
  };
}
