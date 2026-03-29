import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = (await req.json()) as { content?: string };

  if (!body.content?.trim()) {
    return NextResponse.json({ message: "评论内容不能为空" }, { status: 400 });
  }

  const comment = await prisma.ideaComment.create({
    data: {
      ideaId: id,
      content: body.content.trim(),
      createdBy: session.user.id,
    },
  });

  return NextResponse.json(comment);
}
