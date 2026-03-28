import { load } from "cheerio";
import { claudeJson, claudeMessages } from "@/lib/claude-client";
import type { SupplierFileCategory } from "@prisma/client";

export async function scrapeWebsitePlainText(url: string): Promise<string | null> {
  try {
    const u = url.startsWith("http") ? url : `https://${url}`;
    const res = await fetch(u, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SupplierBot/1.0; +https://example.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = load(html);
    $("script, style, nav, footer, noscript").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim();
    return text.slice(0, 50_000);
  } catch {
    return null;
  }
}

const websiteSchema =
  "Return JSON only with keys: nameEn (string|null), intro (string), mainProducts (string), capacity (string), certifications (string), contactsSummary (string), suggestedCategories (string comma-separated Chinese), profileSummary (string, 2-4 sentences Chinese), paymentTermsGuess (string|null), moqGuess (string|null). Use null if unknown.";

export async function aiExtractWebsiteFields(pageText: string) {
  return claudeJson<Record<string, string | null>>({
    system: `You extract B2B supplier facts from noisy webpage text. ${websiteSchema}`,
    user: `Web page plain text:\n\n${pageText}`,
  });
}

export async function aiGuessFileCategory(params: {
  originalName: string;
  mimeType: string;
  textSnippet: string;
}): Promise<SupplierFileCategory | null> {
  type R = { category: SupplierFileCategory };
  const r = await claudeJson<R>({
    system: `Pick exactly one category for a supplier document. Valid values: CATALOG, PRICE_LIST, TEST_REPORT, CERTIFICATION, CONTRACT, PACKAGING, PRODUCT_IMAGE, OTHER. Reply JSON: {"category":"..."}`,
    user: `filename: ${params.originalName}\nmime: ${params.mimeType}\nsnippet:\n${params.textSnippet.slice(0, 8000)}`,
  });
  return r?.category ?? null;
}

export async function aiAnalyzeFileByCategory(params: {
  category: SupplierFileCategory;
  originalName: string;
  text: string;
}) {
  const { category, originalName, text } = params;
  const base = `Document: ${originalName}\n\n${text.slice(0, 45_000)}`;

  if (category === "CATALOG") {
    return claudeJson<{
      summary: string;
      products: Array<{ name: string; specs?: string; highlights?: string }>;
    }>({
      system:
        "Extract product catalog structure. JSON: {summary, products:[{name, specs, highlights}]}. Chinese for summary.",
      user: base,
    });
  }
  if (category === "PRICE_LIST") {
    return claudeJson<{
      summary: string;
      items: Array<{
        skuOrName: string;
        price?: string;
        moq?: string;
        note?: string;
        competitive?: boolean;
      }>;
    }>({
      system:
        "Extract pricing. Mark competitive:true for unusually good value vs peers if inferable. JSON: {summary, items:[...]}.",
      user: base,
    });
  }
  if (category === "TEST_REPORT") {
    return claudeJson<{
      summary: string;
      tests: Array<{ name: string; result?: string; pass?: boolean }>;
      amazonCompliance: { ok: boolean; notes: string };
    }>({
      system:
        "Assess Amazon US compliance heuristically from test report text. JSON as specified.",
      user: base,
    });
  }
  if (category === "CERTIFICATION") {
    return claudeJson<{
      summary: string;
      certType: string;
      expiryDate: string | null;
      issuer?: string;
    }>({
      system:
        "Identify certificate. expiryDate as ISO date YYYY-MM-DD or null. JSON: {summary, certType, expiryDate, issuer}.",
      user: base,
    });
  }

  return claudeJson<{ summary: string; details?: string }>({
    system: "Summarize this supplier document in Chinese. JSON: {summary, details}.",
    user: base,
  });
}

export async function aiSupplierEvaluation(params: {
  supplierJson: string;
}) {
  return claudeJson<{
    overallScore: number;
    strengths: string[];
    risks: string[];
    recommendedCategories: string[];
    demandMatchNote: string;
  }>({
    system:
      "Evaluate supplier for cross-border e-commerce. overallScore 1-5 number. JSON keys: overallScore, strengths[], risks[], recommendedCategories[] (Chinese), demandMatchNote (Chinese).",
    user: params.supplierJson,
  });
}

export async function aiMatchSuppliersForCategory(params: {
  categoryHint: string;
  suppliersBrief: string;
}) {
  return claudeJson<{
    matches: Array<{
      supplierId: string;
      score: number;
      reason: string;
      keyFacts: string;
    }>;
  }>({
    system:
      "Rank suppliers for sourcing category. JSON: {matches:[{supplierId, score 0-100, reason Chinese, keyFacts Chinese MOQ/lead/price if known}]}. Only use given supplier IDs.",
    user: `Category / demand:\n${params.categoryHint}\n\nSuppliers:\n${params.suppliersBrief}`,
  });
}

export async function aiFreeformOrNull(prompt: string) {
  return claudeMessages({ user: prompt, maxTokens: 2048 });
}
