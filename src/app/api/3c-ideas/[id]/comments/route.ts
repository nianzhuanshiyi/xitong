import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { session, error } = await requireModuleAccess("3c-ideas");
  if (error) return error;

  const { id } = await ctx.params;
  const body = (await req.json()) as { content?: string };

  if (!body.content?.trim()) {
    return NextResponse.json({ message: "评论内容不能为空" }, { status: 400 });
  }

  const comment = await prisma.ideaComment3C.create({
    data: {
      ideaId: id,
      content: body.content.trim(),
      createdBy: session.user.id,
    },
  });

  return NextResponse.json(comment);
}
