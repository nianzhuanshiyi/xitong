import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const MAX_CHARS = 48_000;

/**
 * Extract text from a supplier file.
 * Accepts either a file path or a Buffer directly (for DB-stored files).
 */
export async function extractTextFromSupplierFile(
  absPathOrBuffer: string | Buffer,
  mime: string,
  originalName: string
): Promise<string> {
  let buf: Buffer | null = null;
  let source: string;

  if (Buffer.isBuffer(absPathOrBuffer)) {
    buf = absPathOrBuffer;
    source = "buffer-from-db";
    console.log("[FILE-TEXT] Source: buffer-from-db, size:", buf.length, "file:", originalName);
  } else {
    if (!existsSync(absPathOrBuffer)) {
      console.warn("[FILE-TEXT] Local file not found:", absPathOrBuffer, "file:", originalName);
      return `[文件不存在] ${originalName} (路径: ${absPathOrBuffer})`;
    }
    buf = await readFile(absPathOrBuffer);
    source = "local-filesystem";
    console.log("[FILE-TEXT] Source: local-filesystem, size:", buf.length, "file:", originalName);
  }

  const lower = mime.toLowerCase();
  if (lower === "application/pdf") {
    try {
      console.log("[FILE-TEXT] Parsing PDF:", originalName, "buffer size:", buf.length);
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buf });
      const text = await parser.getText();
      await parser.destroy();
      const doc = text.text?.trim() ?? "";
      if (!doc) {
        console.warn("[FILE-TEXT] PDF has no extractable text:", originalName);
        return `[PDF 无可提取文本（可能为扫描件/图片PDF）] ${originalName}`;
      }
      const result = doc.slice(0, MAX_CHARS);
      console.log("[FILE-TEXT] Source:", source, "Text length:", result.length, "file:", originalName);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[FILE-TEXT] PDF parse failed for ${originalName}:`, msg);
      return `[PDF 解析失败: ${msg}] ${originalName}`;
    }
  }
  if (lower.startsWith("text/")) {
    const result = buf.toString("utf8").slice(0, MAX_CHARS);
    console.log("[FILE-TEXT] Source:", source, "Text length:", result.length, "file:", originalName);
    return result;
  }
  console.log("[FILE-TEXT] Non-text file, metadata only:", originalName, "MIME:", mime);
  return `[非文本文件，仅提供元数据] 文件名: ${originalName}, MIME: ${mime}`;
}
