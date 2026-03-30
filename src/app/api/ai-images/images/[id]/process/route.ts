import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { ensureProjectDirs, publicRoot } from "@/lib/ai-images/paths";

export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("crop_amazon") }),
  z.object({
    action: z.literal("white_bg"),
  }),
  z.object({
    action: z.literal("adjust"),
    brightness: z.number().min(0.4).max(2.5).default(1),
  }),
  z.object({
    action: z.literal("text"),
    text: z.string().min(1).max(80),
    position: z.enum(["bottom", "top"]).default("bottom"),
  }),
]);

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { session, error } = await requireModuleAccess("ai-images");
  if (error) return error;
  const { id: sourceId } = await ctx.params;

  const row = await prisma.generatedImage.findFirst({
    where: { id: sourceId },
    include: { project: true },
  });
  if (!row || row.project.userId !== session!.user.id) {
    return NextResponse.json({ message: "图片不存在" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ message: "无效的 JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "参数错误", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const relPath = row.filePath?.trim().replace(/^\/+/, "") ?? "";
  if (!relPath) {
    return NextResponse.json(
      { message: "此图片为内联存储，无法在此接口做本地文件处理" },
      { status: 400 }
    );
  }
  const abs = path.join(publicRoot(), relPath);
  if (!fs.existsSync(abs)) {
    return NextResponse.json({ message: "文件已丢失" }, { status: 410 });
  }

  const input = await fs.promises.readFile(abs);
  let pipeline = sharp(input).rotate();
  const meta = await sharp(input).metadata();
  const w = meta.width ?? 1600;
  const h = meta.height ?? 1600;

  try {
    if (parsed.data.action === "crop_amazon") {
      const side = Math.min(w, h);
      const left = Math.max(0, Math.floor((w - side) / 2));
      const top = Math.max(0, Math.floor((h - side) / 2));
      pipeline = pipeline.extract({ left, top, width: side, height: side }).resize(1600, 1600);
    } else if (parsed.data.action === "white_bg") {
      pipeline = pipeline.flatten({ background: { r: 255, g: 255, b: 255 } });
    } else if (parsed.data.action === "adjust") {
      const { brightness } = parsed.data;
      pipeline = pipeline.modulate({
        brightness: Math.round(brightness * 100),
        saturation: 100,
      });
    } else if (parsed.data.action === "text") {
      const { text, position } = parsed.data;
      const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/"/g, "&quot;");
      const y = position === "top" ? "8%" : "88%";
      const svg = Buffer.from(
        `<svg width="${w}" height="${h}">
          <style>
            .t { fill: #fff; stroke: #000; stroke-width: 2px; paint-order: stroke; font-size: 42px; font-family: system-ui, sans-serif; font-weight: 700; }
          </style>
          <text x="50%" y="${y}" text-anchor="middle" class="t">${escaped}</text>
        </svg>`
      );
      pipeline = pipeline.composite([{ input: svg, blend: "over" }]);
    }
  } catch {
    return NextResponse.json({ message: "处理失败" }, { status: 400 });
  }

  const outBuf = await pipeline.png().toBuffer();
  const projectId = row.projectId;
  ensureProjectDirs(projectId);
  const fname = `gen-edit-${crypto.randomUUID()}.png`;
  const rel = path
    .join("uploads", "ai-images", projectId, "gen", fname)
    .replace(/\\/g, "/");
  const outAbs = path.join(publicRoot(), rel);
  await fs.promises.writeFile(outAbs, outBuf);

  const note = `后处理: ${parsed.data.action}`;
  const newRow = await prisma.generatedImage.create({
    data: {
      projectId,
      imageType: row.imageType,
      prompt: row.prompt,
      fullPrompt: row.fullPrompt,
      promptEn: row.promptEn,
      promptZh: row.promptZh ? `${row.promptZh}\n${note}` : note,
      paramsJson: JSON.stringify({
        sourceId,
        action: parsed.data,
      }),
      style: row.style,
      width: row.width,
      height: row.height,
      filePath: rel,
      parentImageId: sourceId,
    },
  });

  return NextResponse.json({
    id: newRow.id,
    url: `/${rel}`,
    filePath: rel,
  });
}
