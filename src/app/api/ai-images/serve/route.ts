import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // 权限校验
  const { error } = await requireModuleAccess("ai-images");
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const filePath = searchParams.get("path");

  if (!filePath) {
    return new NextResponse("Missing path", { status: 400 });
  }

  // 安全检查：防止目录穿越，且只允许访问 uploads 目录
  const normalizedPath = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalizedPath.includes("..") || !normalizedPath.startsWith("uploads/")) {
    return new NextResponse("Invalid path", { status: 403 });
  }

  try {
    const fullPath = path.join(process.cwd(), "public", normalizedPath);
    const buffer = await fs.readFile(fullPath);
    
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("File not found", { status: 404 });
  }
}
