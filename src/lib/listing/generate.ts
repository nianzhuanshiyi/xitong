import { claudeJson, claudeMessagesStream } from "@/lib/claude-client";
import { buildListingSystemPrompt, buildListingUserPrompt } from "./prompt";
import { normalizeListingResult } from "./normalize";
import { refineSearchTerms } from "./postprocess";
import type {
  ListingGenerateFlags,
  ListingInputPayload,
  ListingResultPayload,
} from "./types";

function extractJsonBlock(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) return fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1).trim();
  return text.trim();
}

export async function generateListingFull(
  input: ListingInputPayload,
  flags: ListingGenerateFlags,
  onTextDelta: (delta: string) => void
): Promise<ListingResultPayload> {
  const system = buildListingSystemPrompt(flags);
  const user = buildListingUserPrompt(input, flags);
  const raw = await claudeMessagesStream({
    system,
    user,
    maxTokens: 16_384,
    onTextDelta,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(extractJsonBlock(raw)) as Record<string, unknown>;
  } catch {
    throw new Error("AI 返回无法解析为 JSON，请重试或缩短竞品上下文");
  }

  let result = normalizeListingResult(parsed);
  const primaryTitle = result.titles[0] || input.productName;
  if (flags.searchTerms && result.searchTerms.trim()) {
    result = {
      ...result,
      searchTerms: refineSearchTerms(
        result.searchTerms,
        primaryTitle,
        input.brandName
      ),
    };
  }
  return result;
}

export async function regenerateSingleBullet(params: {
  input: ListingInputPayload;
  index: number;
  currentBullets: string[];
  flags: ListingGenerateFlags;
}): Promise<string> {
  const idx = params.index;
  const system =
    "You write one Amazon bullet point only. Reply JSON: {\"bullet\":\"...\"}. Max 500 characters. Start with short ALL CAPS phrase + colon.";
  const user = `Language context: marketplace ${params.input.marketplace}. Brand: ${params.input.brandName}. Product: ${params.input.productName}.\nSelling points:\n${params.input.sellingPoints}\nKeywords:\n${params.input.coreKeywords}\nBanned:\n${params.input.bannedWords}\nOther bullets (do not repeat verbatim):\n${params.currentBullets.map((b, i) => `${i + 1}. ${b}`).join("\n")}\nRewrite ONLY bullet #${idx + 1}.`;
  const r = await claudeJson<{ bullet?: string }>({ system, user });
  return (r?.bullet ?? "").trim();
}

export async function regenerateDescription(params: {
  input: ListingInputPayload;
  flags: ListingGenerateFlags;
}): Promise<string> {
  const system =
    "You write Amazon product description HTML only. Reply JSON: {\"productDescriptionHtml\":\"...\"}. Use <p>, <b>, <ul><li>. Max ~2000 visible characters.";
  const user = `Marketplace: ${params.input.marketplace}. Brand: ${params.input.brandName}. Product: ${params.input.productName}.\nPoints:\n${params.input.sellingPoints}\nSpecs:\n${params.input.specs}\nKeywords:\n${params.input.coreKeywords}\nBanned:\n${params.input.bannedWords}`;
  const r = await claudeJson<{ productDescriptionHtml?: string }>({
    system,
    user,
  });
  return (r?.productDescriptionHtml ?? "").trim();
}

export async function regenerateSearchTerms(params: {
  input: ListingInputPayload;
  title: string;
}): Promise<string> {
  const system =
    'Reply JSON only: {"searchTerms":"..."} — space-separated backend keywords, no punctuation, no brand, no words from title; UTF-8 under 249 bytes.';
  const user = `Title (exclude these terms): ${params.title}\nBrand (exclude): ${params.input.brandName}\nKeywords to include where possible:\n${params.input.coreKeywords}`;
  const r = await claudeJson<{ searchTerms?: string }>({ system, user });
  const raw = (r?.searchTerms ?? "").trim();
  return refineSearchTerms(raw, params.title, params.input.brandName);
}

export async function regenerateTitles(params: {
  input: ListingInputPayload;
  flags: ListingGenerateFlags;
}): Promise<[string, string, string]> {
  const system =
    'Reply JSON: {"titles":["","",""]} — exactly 3 Amazon titles, brand first, max 200 chars each.';
  const user = `Marketplace ${params.input.marketplace}. Brand: ${params.input.brandName}. Product: ${params.input.productName}.\nSelling points:\n${params.input.sellingPoints}\nKeywords:\n${params.input.coreKeywords}`;
  const r = await claudeJson<{ titles?: string[] }>({ system, user });
  const t = r?.titles ?? [];
  return [
    String(t[0] ?? ""),
    String(t[1] ?? ""),
    String(t[2] ?? ""),
  ];
}

export async function regenerateAplus(params: {
  input: ListingInputPayload;
}): Promise<ListingResultPayload["aplus"]> {
  const system =
    'Reply JSON: {"aplus":{"brandStory":"","comparison":"","scenarios":"","faq":""}} in target language for marketplace.';
  const user = `Marketplace: ${params.input.marketplace}. Brand: ${params.input.brandName}. Product: ${params.input.productName}.\n${params.input.sellingPoints}`;
  const r = await claudeJson<{ aplus?: ListingResultPayload["aplus"] }>({
    system,
    user,
  });
  const a = r?.aplus;
  return {
    brandStory: a?.brandStory ?? "",
    comparison: a?.comparison ?? "",
    scenarios: a?.scenarios ?? "",
    faq: a?.faq ?? "",
  };
}
