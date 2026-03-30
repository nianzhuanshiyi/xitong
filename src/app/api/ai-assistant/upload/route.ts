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

  return NextResponse.json({
    url,
    fileName: file.name,
    fileType: file.type,
  });
}
