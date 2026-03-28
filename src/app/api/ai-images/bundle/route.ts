import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  projectId: z.string(),
  orderedImageIds: z.array(z.string()).max(7),
});

export async function POST(req: Request) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
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

  const { projectId, orderedImageIds } = parsed.data;
  const project = await prisma.imageProject.findFirst({
    where: { id: projectId, userId: session.user.id },
  });
  if (!project) {
    return NextResponse.json({ message: "项目不存在" }, { status: 404 });
  }

  const uniq = Array.from(new Set(orderedImageIds));
  const imgs = await prisma.generatedImage.findMany({
    where: { projectId, id: { in: uniq } },
    select: { id: true },
  });
  if (imgs.length !== uniq.length) {
    return NextResponse.json({ message: "包含无效图片 ID" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.generatedImage.updateMany({
      where: { projectId },
      data: { sortPosition: null },
    });
    for (let i = 0; i < uniq.length; i++) {
      await tx.generatedImage.update({
        where: { id: uniq[i] },
        data: { sortPosition: i },
      });
    }
  });

  return NextResponse.json({ ok: true, slots: uniq.length });
}
