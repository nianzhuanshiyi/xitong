import type {
  ListingGenerateFlags,
  ListingInputPayload,
  MarketplaceCode,
} from "./types";

const LOCALE: Record<MarketplaceCode, { lang: string; amazon: string }> = {
  US: { lang: "American English", amazon: "Amazon.com (US)" },
  CA: { lang: "Canadian English", amazon: "Amazon.ca" },
  UK: { lang: "British English", amazon: "Amazon.co.uk" },
  DE: { lang: "German", amazon: "Amazon.de" },
  JP: { lang: "Japanese", amazon: "Amazon.co.jp" },
  AU: { lang: "Australian English", amazon: "Amazon.com.au" },
};

const STYLE_DESC: Record<string, string> = {
  professional: "professional, precise, trustworthy; avoid hype",
  friendly: "warm, conversational, approachable",
  luxury: "premium, elegant, understated sophistication",
  concise: "direct, scannable, minimal filler",
};

export function buildListingSystemPrompt(flags: ListingGenerateFlags): string {
  const parts: string[] = [
    "You are an expert Amazon Listing copywriter and SEO specialist.",
    "Follow Amazon policy: no promotional claims (best/cheapest/#1), no false medical claims, no competitor attacks by name.",
  ];

  if (flags.title) {
    parts.push(
      "TITLE: Exactly 3 alternative titles in array `titles` (index 0–2). Brand name must appear at the beginning. Put the strongest relevant keywords early. Max 200 characters each (count characters, not bytes). No ALL CAPS spam."
    );
  }
  if (flags.bullets) {
    parts.push(
      "BULLETS: Exactly 5 strings in `bullets`. Each starts with a short ALL CAPS highlight phrase (2–5 words) followed by colon and benefit-focused copy. Each bullet max 500 characters. Include relevant keywords naturally. Emotional, customer-centric."
    );
  }
  if (flags.description) {
    parts.push(
      "DESCRIPTION: `productDescriptionHtml` — valid simple HTML for Amazon (e.g. <p>, <b>, <ul><li>). Max ~2000 characters of visible text (excluding tags). Structured: hook, features, specs, care if relevant."
    );
  }
  if (flags.searchTerms) {
    parts.push(
      "SEARCH TERMS: `searchTerms` — single string, keywords separated by SINGLE SPACES only. No punctuation, no repetition of words from the primary title, no brand name. Target under 249 bytes in UTF-8 (critical)."
    );
  }
  if (flags.aplus) {
    parts.push(
      "A+ CONTENT: `aplus` object with keys brandStory, comparison, scenarios, faq — each a concise module copy block in the target language (suitable for Amazon A+ modules)."
    );
  }

  parts.push(
    "Output ONLY valid JSON (no markdown fences). Keys must exist as requested; use empty string \"\" for unused sections."
  );

  return parts.join("\n");
}

export function buildListingUserPrompt(
  input: ListingInputPayload,
  flags: ListingGenerateFlags
): string {
  const loc = LOCALE[input.marketplace];
  const style = STYLE_DESC[input.style] ?? STYLE_DESC.professional;

  const keys: string[] = [];
  if (flags.title) keys.push('"titles": string[3]');
  if (flags.bullets) keys.push('"bullets": string[5]');
  if (flags.description) keys.push('"productDescriptionHtml": string');
  if (flags.searchTerms) keys.push('"searchTerms": string');
  if (flags.aplus) {
    keys.push(
      '"aplus": { "brandStory": string, "comparison": string, "scenarios": string, "faq": string }'
    );
  }

  const sections: string[] = [
    `Marketplace: ${loc.amazon}`,
    `Write ALL customer-facing copy in ${loc.lang}.`,
    `Tone: ${style}`,
    `Category (browse node hint): ${input.category}`,
    `Product name: ${input.productName}`,
    `Brand: ${input.brandName}`,
    `Core selling points (one idea per line):\n${input.sellingPoints || "(none)"}`,
    `Specs / materials / size / weight / qty:\n${input.specs || "(none)"}`,
    `Target audience: ${input.targetAudience || "(not specified)"}`,
    `Use cases: ${input.useCases || "(not specified)"}`,
    `Core keywords to weave in naturally (one per line):\n${input.coreKeywords || "(none)"}`,
    `Words/phrases to NEVER use:\n${input.bannedWords || "(none)"}`,
    `Extra requirements:\n${input.extraNotes || "(none)"}`,
  ];

  if (input.competitorContext?.trim()) {
    sections.push(
      `Competitor reference data (SellerSprite / internal). Analyze strengths/weaknesses and outperform without copying:\n${input.competitorContext.slice(0, 24_000)}`
    );
  }

  sections.push(`Return a single JSON object with these keys: ${keys.join(", ")}`);

  return sections.join("\n\n");
}
