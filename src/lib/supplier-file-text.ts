import { readFile } from "node:fs/promises";

const MAX_CHARS = 48_000;

export async function extractTextFromSupplierFile(
  absPath: string,
  mime: string,
  originalName: string
): Promise<string> {
  const lower = mime.toLowerCase();
  if (lower === "application/pdf") {
    try {
      const buf = await readFile(absPath);
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buf });
      const text = await parser.getText();
      await parser.destroy();
      const doc = text.text?.trim() ?? "";
      return doc.slice(0, MAX_CHARS);
    } catch {
      return `[PDF 解析失败] ${originalName}`;
    }
  }
  if (lower.startsWith("text/")) {
    const raw = await readFile(absPath, "utf8");
    return raw.slice(0, MAX_CHARS);
  }
  return `[非文本文件，仅提供元数据] 文件名: ${originalName}, MIME: ${mime}`;
}
