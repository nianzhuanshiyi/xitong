import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/permissions";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_TEXT_CHARS = 8000;

async function extractTextNonPdf(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string | null> {
  const lower = mimeType.toLowerCase();

  // Plain text / CSV
  if (lower === "text/plain" || lower === "text/csv") {
    return buffer.toString("utf8").slice(0, MAX_TEXT_CHARS);
  }

  // DOCX
  if (
    lower ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower === "application/msword"
  ) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value?.trim() ?? "";
      return text ? text.slice(0, MAX_TEXT_CHARS) : null;
    } catch (err) {
      console.error(`[ai-upload] DOCX parse failed for ${fileName}:`, err);
      return null;
    }
  }

  // Excel / Images — no text extraction
  return null;
}

export async function POST(req: NextRequest) {
  const { error } = await requireModuleAccess("ai-assistant");
  if (error) return error;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ message: "未选择文件" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { message: `不支持的文件类型: ${file.type}` },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { message: "文件大小超过 10MB 限制" },
      { status: 400 }
    );
  }

  const dateDir = new Date().toISOString().slice(0, 10);
  const uploadDir = path.join(
    process.cwd(),
    "public",
    "uploads",
    "ai-assistant",
    dateDir
  );
  await mkdir(uploadDir, { recursive: true });

  const ext = path.extname(file.name) || "";
  const baseName = path.basename(file.name, ext).slice(0, 50);
  const uniqueName = `${baseName}-${Date.now()}${ext}`;
  const filePath = path.join(uploadDir, uniqueName);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  const url = `/uploads/ai-assistant/${dateDir}/${uniqueName}`;
  const isPdf = file.type.toLowerCase() === "application/pdf";

  // For PDFs: return base64 so Claude can read it natively
  // For other files: extract text content
  let fileContent: string | null = null;
  let fileBase64: string | null = null;

  if (isPdf) {
    fileBase64 = buffer.toString("base64");
    console.log(
      "[UPLOAD] PDF file, returning base64, size:",
      buffer.length,
      "base64 length:",
      fileBase64.length
    );
  } else {
    fileContent = await extractTextNonPdf(buffer, file.type, file.name);
    console.log(
      "[UPLOAD] Non-PDF file, extracted text length:",
      fileContent?.length ?? 0
    );
  }

  return NextResponse.json({
    url,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    fileContent,
    fileBase64,
  });
}
