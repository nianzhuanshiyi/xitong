import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import {
  ensureProjectDirs,
  projectUploadDir,
  publicRoot,
} from "@/lib/ai-images/paths";
import { parseReferencePaths } from "@/lib/ai-images/refs";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { session, error } = await requireModuleAccess("ai-images");
  if (error) return error;
  const { id: projectId } = await ctx.params;

  const project = await prisma.imageProject.findFirst({
    where: { id: projectId, userId: session!.user.id },
  });
  if (!project) {
    return NextResponse.json({ message: "项目不存在" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ message: "无效的表单" }, { status: 400 });
  }

  const files = formData.getAll("file").filter((x): x is File => x instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ message: "未选择文件" }, { status: 400 });
  }

  const existing = parseReferencePaths(project.referencePathsJson);
  const room = 5 - existing.length;
  if (room <= 0) {
    return NextResponse.json({ message: "最多 5 张参考图" }, { status: 400 });
  }

  const take = files.slice(0, room);
  ensureProjectDirs(projectId);
  const refDir = path.join(projectUploadDir(projectId), "ref");

  const newPaths: string[] = [];
  for (const file of take) {
    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);
    const name = `ref-${crypto.randomUUID()}.jpg`;
    const outAbs = path.join(refDir, name);
    try {
      await sharp(buf)
        .rotate()
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: false })
        .jpeg({ quality: 82, mozjpeg: true })
        .toFile(outAbs);
    } catch {
      return NextResponse.json({ message: "图片处理失败" }, { status: 400 });
    }
    const rel = path
      .join("uploads", "ai-images", projectId, "ref", name)
      .replace(/\\/g, "/");
    newPaths.push(rel);
  }

  const merged = [...existing, ...newPaths];
  await prisma.imageProject.update({
    where: { id: projectId },
    data: { referencePathsJson: JSON.stringify(merged) },
  });

  return NextResponse.json({
    paths: merged,
    urls: merged.map((r) => `/${r}`),
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { session, error } = await requireModuleAccess("ai-images");
  if (error) return error;
  const { id: projectId } = await ctx.params;
  const project = await prisma.imageProject.findFirst({
    where: { id: projectId, userId: session!.user.id },
  });
  if (!project) {
    return NextResponse.json({ message: "项目不存在" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const idx = Number(searchParams.get("index"));
  if (!Number.isFinite(idx) || idx < 0) {
    return NextResponse.json({ message: "index 无效" }, { status: 400 });
  }

  const paths = parseReferencePaths(project.referencePathsJson);
  if (idx >= paths.length) {
    return NextResponse.json({ message: "索引越界" }, { status: 400 });
  }
  const [removed] = paths.splice(idx, 1);
  const abs = path.join(publicRoot(), removed.replace(/^\/+/, ""));
  try {
    await fs.promises.unlink(abs);
  } catch {
    /* ignore */
  }

  await prisma.imageProject.update({
    where: { id: projectId },
    data: { referencePathsJson: JSON.stringify(paths) },
  });

  return NextResponse.json({
    paths,
    urls: paths.map((r) => `/${r.replace(/^\/+/, "")}`),
  });
}
