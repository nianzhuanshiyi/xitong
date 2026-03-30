import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { absolutePathFromRelative } from "@/lib/supplier-uploads";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { error } = await requireModuleAccess("suppliers");
  if (error) return error;
  const { id, fileId } = await params;
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") ?? "inline";

  const f = await prisma.supplierFile.findFirst({
    where: { id: fileId, supplierId: id },
  });
  if (!f) return NextResponse.json({ message: "未找到" }, { status: 404 });

  let buffer: Buffer;
  try {
    buffer = await readFile(absolutePathFromRelative(f.relativePath));
  } catch {
    return NextResponse.json({ message: "文件不存在" }, { status: 404 });
  }

  const disposition = mode === "download" ? "attachment" : "inline";
  const encoded = encodeURIComponent(f.originalName);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": f.mimeType,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encoded}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
