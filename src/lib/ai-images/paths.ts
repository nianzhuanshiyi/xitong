import path from "node:path";
import fs from "node:fs";

export function publicRoot(): string {
  return path.join(process.cwd(), "public");
}

export function projectUploadDir(projectId: string): string {
  return path.join(publicRoot(), "uploads", "ai-images", projectId);
}

export function ensureProjectDirs(projectId: string): void {
  const base = projectUploadDir(projectId);
  fs.mkdirSync(path.join(base, "ref"), { recursive: true });
  fs.mkdirSync(path.join(base, "gen"), { recursive: true });
}

/** 返回以 / 开头的 URL 路径 */
export function toPublicUrl(fsPathRelativeToPublic: string): string {
  const p = fsPathRelativeToPublic.replace(/\\/g, "/").replace(/^\/+/, "");
  return `/${p}`;
}
