import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const MAX_CHARS = 48_000;

/**
 * Robust PDF text extraction with fallback.
 * Uses pdf-parse v2 API with try-catch and raw buffer fallback.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const mod = await import("pdf-parse");
    // pdf-parse v2 uses named export PDFParse
    if ("PDFParse" in mod && typeof mod.PDFParse === "function") {
      const parser = new mod.PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();
      const text = result.text?.trim() ?? "";
      if (text.length > 0) return text;
      return "[PDF 内容为空或为扫描件，无法提取文字]";
    }
    // pdf-parse v1 fallback (default export is a function)
    const pdfParseFn = (mod as Record<string, unknown>).default;
    if (typeof pdfParseFn === "function") {
      const data = await (pdfParseFn as (buf: Buffer) => Promise<{ text: string }>)(buffer);
      if (data.text && data.text.trim().length > 0) return data.text;
      return "[PDF 内容为空或为扫描件，无法提取文字]";
    }
    console.error("[PDF-PARSE] No recognized export found in pdf-parse module");
    return "[PDF 解析模块加载异常]";
  } catch (error) {
    console.error("[PDF-PARSE] Failed:", error);

    // Fallback: try to extract readable text from raw buffer
    try {
      const text = buffer.toString("utf-8");
      const readable = text
        .replace(
          /[^\x20-\x7E\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\n\r\t]/g,
          " "
        )
        .replace(/\s{3,}/g, " ")
        .trim();
      if (readable.length > 100) {
        return readable.substring(0, 8000);
      }
    } catch {
      /* ignore */
    }

    return "[PDF 解析失败，请在对话中手动粘贴文件关键内容]";
  }
}

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
    console.log(
      "[FILE-TEXT] Source: buffer-from-db, size:",
      buf.length,
      "file:",
      originalName
    );
  } else {
    if (!existsSync(absPathOrBuffer)) {
      console.warn(
        "[FILE-TEXT] Local file not found:",
        absPathOrBuffer,
        "file:",
        originalName
      );
      return `[文件不存在] ${originalName} (路径: ${absPathOrBuffer})`;
    }
    buf = await readFile(absPathOrBuffer);
    source = "local-filesystem";
    console.log(
      "[FILE-TEXT] Source: local-filesystem, size:",
      buf.length,
      "file:",
      originalName
    );
  }

  const lower = mime.toLowerCase();
  if (lower === "application/pdf") {
    console.log(
      "[FILE-TEXT] Parsing PDF:",
      originalName,
      "buffer size:",
      buf.length
    );
    const text = await extractPdfText(buf);
    const result = text.slice(0, MAX_CHARS);
    console.log(
      "[FILE-TEXT] Source:",
      source,
      "Text length:",
      result.length,
      "file:",
      originalName
    );
    return result;
  }
  if (lower.startsWith("text/")) {
    const result = buf.toString("utf8").slice(0, MAX_CHARS);
    console.log(
      "[FILE-TEXT] Source:",
      source,
      "Text length:",
      result.length,
      "file:",
      originalName
    );
    return result;
  }
  console.log(
    "[FILE-TEXT] Non-text file, metadata only:",
    originalName,
    "MIME:",
    mime
  );
  return `[非文本文件，仅提供元数据] 文件名: ${originalName}, MIME: ${mime}`;
}
