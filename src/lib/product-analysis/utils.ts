export function extractNodeId(obj: unknown, depth = 0): string | null {
  if (depth > 12 || obj == null) return null;
  if (typeof obj !== "object") return null;
  if (Array.isArray(obj)) {
    for (const x of obj) {
      const n = extractNodeId(x, depth + 1);
      if (n) return n;
    }
    return null;
  }
  const o = obj as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    if (
      /^(nodeId|categoryId|browseNodeId|node_id|category_id)$/i.test(k) &&
      (typeof v === "string" || typeof v === "number")
    ) {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  for (const v of Object.values(o)) {
    const n = extractNodeId(v, depth + 1);
    if (n) return n;
  }
  return null;
}

export function guessPriceFromDetail(detail: unknown): number | null {
  if (detail == null || typeof detail !== "object") return null;
  const keys = [
    "price",
    "listPrice",
    "currentPrice",
    "salePrice",
    "buyBoxPrice",
    "landedPrice",
  ];
  const stack: unknown[] = [detail];
  let depth = 0;
  while (stack.length && depth < 30) {
    const cur = stack.pop();
    depth++;
    if (cur == null || typeof cur !== "object") continue;
    if (Array.isArray(cur)) {
      for (const x of cur) stack.push(x);
      continue;
    }
    const o = cur as Record<string, unknown>;
    for (const k of keys) {
      const v = o[k];
      if (typeof v === "number" && v > 0 && v < 100000) return v;
      if (typeof v === "string") {
        const n = parseFloat(v.replace(/[^0-9.]/g, ""));
        if (!Number.isNaN(n) && n > 0 && n < 100000) return n;
      }
    }
    for (const v of Object.values(o)) stack.push(v);
  }
  return null;
}

export function collectSeries(
  data: unknown,
  maxPoints = 60
): { bsr: { date: string; value: number }[]; price: { date: string; value: number }[] } {
  const bsr: { date: string; value: number }[] = [];
  const price: { date: string; value: number }[] = [];

  const visit = (obj: unknown, d = 0) => {
    if (d > 14 || obj == null) return;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (item && typeof item === "object") {
          const it = item as Record<string, unknown>;
          const t =
            (it.time as string) ??
            (it.date as string) ??
            (it.t as string) ??
            (it.ts as string);
          const rank =
            typeof it.bsr === "number"
              ? it.bsr
              : typeof it.rank === "number"
                ? it.rank
                : typeof it.value === "number"
                  ? it.value
                  : null;
          const p =
            typeof it.price === "number"
              ? it.price
              : typeof it.amazon === "number"
                ? it.amazon
                : null;
          if (t && rank != null && rank > 0)
            bsr.push({ date: String(t), value: rank });
          if (t && p != null && p > 0)
            price.push({ date: String(t), value: p });
        }
        visit(item, d + 1);
      }
      return;
    }
    if (typeof obj !== "object") return;
    for (const v of Object.values(obj as object)) visit(v, d + 1);
  };

  visit(data);
  const dedupe = <T extends { date: string }>(arr: T[]) =>
    arr.slice(-maxPoints);
  return { bsr: dedupe(bsr), price: dedupe(price) };
}

export function truncateJson(obj: unknown, max = 12000): string {
  const s = JSON.stringify(obj);
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…(truncated)`;
}
