import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import type { SupplierFileCategory } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { extractTextFromSupplierFile } from "@/lib/supplier-file-text";
import { aiGuessFileCategory } from "@/lib/supplier-ai";
import {
  ensureSupplierUploadDir,
  isAllowedSupplierMime,
  makeStoredName,
  publicRelativePath,
  absolutePathFromRelative,
} from "@/lib/supplier-uploads";

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
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  const ok = await prisma.supplier.findUnique({ where: { id }, select: { id: true } });
  if (!ok) return NextResponse.json({ message: "未找到" }, { status: 404 });

  const files = await prisma.supplierFile.findMany({
    where: { supplierId: id },
    orderBy: { uploadedAt: "desc" },
    include: { analysis: true },
  });
  return NextResponse.json(files);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
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
      },
      include: { analysis: true },
    });
    created.push(row);
  }

  await prisma.supplier.update({
    where: { id },
    data: { lastActivityAt: new Date() },
  });

  return NextResponse.json(
    created.length === 1 ? created[0] : { files: created },
    { status: 201 }
  );
}
