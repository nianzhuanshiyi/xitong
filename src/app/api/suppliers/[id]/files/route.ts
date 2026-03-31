import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import type { SupplierFileCategory } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { extractTextFromSupplierFile } from "@/lib/supplier-file-text";
import { aiGuessFileCategory } from "@/lib/supplier-ai";
import {
  ensureSupplierUploadDir,
  isAllowedSupplierMime,
  makeStoredName,
  publicRelativePath,
  absolutePathFromRelative,
} from "@/lib/supplier-uploads";

export const dynamic = "force-dynamic";

const CATEGORIES = new Set<string>([
  "CATALOG",
  "PRICE_LIST",
  "TEST_REPORT",
  "CERTIFICATION",
  "CONTRACT",
  "PACKAGING",
  "PRODUCT_IMAGE",
  "OTHER",
]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireModuleAccess("suppliers");
  if (error) return error;
  const { id } = await params;
  const ok = await prisma.supplier.findUnique({ where: { id }, select: { id: true } });
  if (!ok) return NextResponse.json({ message: "未找到" }, { status: 404 });

  const files = await prisma.supplierFile.findMany({
    where: { supplierId: id },
    orderBy: { uploadedAt: "desc" },
    include: { analysis: true },
  });
  // Strip fileData from response to avoid sending large binary blobs
  const stripped = files.map(({ fileData: _, ...rest }) => rest);
  return NextResponse.json(stripped);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireModuleAccess("suppliers");
  if (error) return error;
  const { id } = await params;
  const ok = await prisma.supplier.findUnique({ where: { id }, select: { id: true } });
  if (!ok) return NextResponse.json({ message: "未找到" }, { status: 404 });

  const form = await req.formData();
  const categoryHint = form.get("category")?.toString();
  const files = form
    .getAll("file")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) {
    return NextResponse.json({ message: "缺少 file" }, { status: 400 });
  }

  await ensureSupplierUploadDir(id);
  const created: Awaited<ReturnType<typeof prisma.supplierFile.create>>[] = [];

  for (const file of files) {
    const mime = file.type || "application/octet-stream";
    if (!isAllowedSupplierMime(mime)) {
      return NextResponse.json(
        { message: `不支持的文件类型: ${file.name}` },
        { status: 400 }
      );
    }

    const originalName = file.name || "upload";
    const storedName = makeStoredName(originalName);
    const rel = publicRelativePath(id, storedName);
    const abs = absolutePathFromRelative(rel);
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(abs, buf);

    let category: SupplierFileCategory = "OTHER";
    if (categoryHint && CATEGORIES.has(categoryHint)) {
      category = categoryHint as SupplierFileCategory;
    } else {
      const snippet = await extractTextFromSupplierFile(abs, mime, originalName);
      const guessed = await aiGuessFileCategory({
        originalName,
        mimeType: mime,
        textSnippet: snippet,
      });
      if (guessed) category = guessed;
    }

    const row = await prisma.supplierFile.create({
      data: {
        supplierId: id,
        storedName,
        originalName,
        mimeType: mime,
        size: buf.length,
        category,
        relativePath: rel,
        fileData: buf,
      },
      include: { analysis: true },
    });
    created.push(row);
  }

  await prisma.supplier.update({
    where: { id },
    data: { lastActivityAt: new Date() },
  });

  // Strip fileData from response
  const stripped = created.map(({ fileData: _, ...rest }) => rest);
  return NextResponse.json(
    stripped.length === 1 ? stripped[0] : { files: stripped },
    { status: 201 }
  );
}
