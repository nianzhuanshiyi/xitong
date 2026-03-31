import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const MAX_CHARS = 48_000;

export async function extractTextFromSupplierFile(
  absPath: string,
  mime: string,
  originalName: string
): Promise<string> {
  if (!existsSync(absPath)) {
    return `[文件不存在] ${originalName} (路径: ${absPath})`;
  }

  const lower = mime.toLowerCase();
  if (lower === "application/pdf") {
    try {
      const buf = await readFile(absPath);
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buf });
      const text = await parser.getText();
      await parser.destroy();
      const doc = text.text?.trim() ?? "";
      if (!doc) {
        return `[PDF 无可提取文本（可能为扫描件/图片PDF）] ${originalName}`;
      }
      return doc.slice(0, MAX_CHARS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[supplier-file-text] PDF parse failed for ${originalName}:`, msg);
      return `[PDF 解析失败: ${msg}] ${originalName}`;
    }
  }
  if (lower.startsWith("text/")) {
    const raw = await readFile(absPath, "utf8");
    return raw.slice(0, MAX_CHARS);
  }
  return `[非文本文件，仅提供元数据] 文件名: ${originalName}, MIME: ${mime}`;
}
