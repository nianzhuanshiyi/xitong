import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { session, error } = await requireModuleAccess("ai-images");
  if (error) return error;
  const { id: projectId } = await ctx.params;

  const project = await prisma.imageProject.findFirst({
    where: { id: projectId, userId: session!.user.id },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ message: "项目不存在" }, { status: 404 });
  }

  const images = await prisma.generatedImage.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ images });
}
