/** 后台搜索词：去重、去品牌/标题词、控制 249 字节（UTF-8） */

function tokenizeForStop(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/i)
    .map((w) => w.trim())
    .filter((w) => w.length > 1);
}

export function refineSearchTerms(
  raw: string,
  title: string,
  brand: string
): string {
  const stop = new Set<string>();
  for (const w of tokenizeForStop(brand)) stop.add(w);
  for (const w of tokenizeForStop(title)) stop.add(w);

  const tokens = raw
    .split(/[\s,;，；、]+/)
    .map((t) => t.trim().replace(/[.,!?;:]+$/g, ""))
    .filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    const key = t.toLowerCase();
    const core = key.replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]/gi, "");
    if (core.length < 2) continue;
    if (stop.has(core)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }

  const enc = new TextEncoder();
  let joined = out.join(" ");
  while (out.length && enc.encode(joined).length > 249) {
    out.pop();
    joined = out.join(" ");
  }
  return joined;
}

export function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** 纯文本长度（用于描述字数统计，不含 HTML 标签） */
export function stripHtmlCharLength(html: string): number {
  return html.replace(/<[^>]*>/g, "").length;
}
