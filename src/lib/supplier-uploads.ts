import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

export const SUPPLIER_UPLOAD_ROOT = path.join(
  process.cwd(),
  "public",
  "uploads",
  "suppliers"
);

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function isAllowedSupplierMime(mime: string) {
  return ALLOWED_MIME.has(mime.toLowerCase());
}

export function supplierUploadDir(supplierId: string) {
  return path.join(SUPPLIER_UPLOAD_ROOT, supplierId);
}

export async function ensureSupplierUploadDir(supplierId: string) {
  const dir = supplierUploadDir(supplierId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function publicRelativePath(supplierId: string, storedName: string) {
  return `suppliers/${supplierId}/${storedName}`;
}

export function absolutePathFromRelative(relativePath: string) {
  return path.join(process.cwd(), "public", "uploads", relativePath);
}

export function makeStoredName(originalName: string) {
  const ext = path.extname(originalName).slice(0, 12) || "";
  const safe = `${Date.now()}-${randomBytes(6).toString("hex")}${ext}`;
  return safe;
}

export function faviconUrlFromWebsite(website: string | null | undefined) {
  if (!website?.trim()) return null;
  try {
    const u = new URL(website.startsWith("http") ? website : `https://${website}`);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
  } catch {
    return null;
  }
}
