import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { publicRoot } from "./paths";

export function parseReferencePaths(json: string): string[] {
  try {
    const a = JSON.parse(json) as unknown;
    if (!Array.isArray(a)) return [];
    return a.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

export async function loadReferencesForClaude(
  referencePathsJson: string
): Promise<{ mediaType: string; base64: string }[]> {
  const rels = parseReferencePaths(referencePathsJson).slice(0, 5);
  const out: { mediaType: string; base64: string }[] = [];
  for (const rel of rels) {
    const clean = rel.replace(/^\/+/, "");
    const abs = path.join(publicRoot(), clean);
    if (!fs.existsSync(abs)) continue;
    try {
      const buf = await fs.promises.readFile(abs);
      const resized = await sharp(buf)
        .rotate()
        .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      out.push({
        mediaType: "image/jpeg",
        base64: resized.toString("base64"),
      });
    } catch {
      /* skip broken file */
    }
  }
  return out;
}
