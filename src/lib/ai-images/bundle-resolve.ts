import { DEFAULT_AMAZON_BUNDLE } from "./bundle-defaults";
import type { BundleSlotAi } from "./claude-image-prompt";
import type { BundleSlot } from "./types";

export function bundleSlotsFromAi(slots: BundleSlotAi[]): BundleSlot[] {
  const sorted = [...slots].sort((a, b) => a.slot - b.slot);
  return sorted.map((s) => ({
    slot: s.slot,
    title: s.title,
    imageType: s.imageType,
    hintZh: s.hintZh,
  }));
}

export function parseBundlePlanJson(json: string | null | undefined): BundleSlot[] {
  if (!json?.trim()) return DEFAULT_AMAZON_BUNDLE;
  try {
    const a = JSON.parse(json) as unknown;
    if (!Array.isArray(a) || a.length !== 7) return DEFAULT_AMAZON_BUNDLE;
    return a as BundleSlot[];
  } catch {
    return DEFAULT_AMAZON_BUNDLE;
  }
}
