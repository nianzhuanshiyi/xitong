import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const { id: projectId } = await ctx.params;

  const project = await prisma.imageProject.findFirst({
    where: { id: projectId, userId: session.user.id },
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
