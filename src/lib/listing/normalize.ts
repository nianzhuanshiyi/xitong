import type { AplusBlocks, ListingResultPayload } from "./types";

function padTitles(t: string[] | undefined): [string, string, string] {
  const a = [...(t ?? [])].slice(0, 3);
  while (a.length < 3) a.push("");
  return [a[0] ?? "", a[1] ?? "", a[2] ?? ""];
}

function padBullets(b: string[] | undefined): string[] {
  const a = [...(b ?? [])].slice(0, 5);
  while (a.length < 5) a.push("");
  return a;
}

const emptyAplus: AplusBlocks = {
  brandStory: "",
  comparison: "",
  scenarios: "",
  faq: "",
};

export function normalizeListingResult(
  raw: Record<string, unknown> | null
): ListingResultPayload {
  if (!raw) {
    return {
      titles: ["", "", ""],
      bullets: ["", "", "", "", ""],
      productDescriptionHtml: "",
      searchTerms: "",
      aplus: { ...emptyAplus },
    };
  }

  const titlesRaw = raw.titles ?? raw.titleVersions;
  let titles: [string, string, string];
  if (Array.isArray(titlesRaw)) {
    titles = padTitles(titlesRaw.map((x) => String(x ?? "")));
  } else if (typeof titlesRaw === "string") {
    titles = [titlesRaw, "", ""];
  } else {
    titles = ["", "", ""];
  }

  const bulletsRaw = raw.bullets ?? raw.bulletPoints;
  const bullets = padBullets(
    Array.isArray(bulletsRaw)
      ? bulletsRaw.map((x) => String(x ?? ""))
      : undefined
  );

  const desc =
    String(
      raw.productDescriptionHtml ??
        raw.descriptionHtml ??
        raw.description ??
        ""
    ) || "";

  const st = String(raw.searchTerms ?? raw.backendSearchTerms ?? "");

  const ap = raw.aplus;
  let aplus: AplusBlocks = { ...emptyAplus };
  if (ap && typeof ap === "object" && !Array.isArray(ap)) {
    const o = ap as Record<string, unknown>;
    aplus = {
      brandStory: String(o.brandStory ?? o.brand_story ?? ""),
      comparison: String(o.comparison ?? o.productComparison ?? ""),
      scenarios: String(o.scenarios ?? o.useScenarios ?? ""),
      faq: String(o.faq ?? o.faqBlock ?? ""),
    };
  }

  return {
    titles,
    bullets,
    productDescriptionHtml: desc,
    searchTerms: st,
    aplus,
  };
}
