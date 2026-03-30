import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireModuleAccess("ai-assistant");
  if (error) return error;

  const { id } = await params;

  const conversation = await prisma.aiConversation.findFirst({
    where: { id, userId: session!.user.id },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!conversation) {
    return NextResponse.json({ message: "会话不存在" }, { status: 404 });
  }

  return NextResponse.json({ conversation });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireModuleAccess("ai-assistant");
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { title, model } = body as { title?: string; model?: string };

  const existing = await prisma.aiConversation.findFirst({
    where: { id, userId: session!.user.id },
  });
  if (!existing) {
    return NextResponse.json({ message: "会话不存在" }, { status: 404 });
  }

  const data: { title?: string; model?: string } = {};
  if (title !== undefined) data.title = title;
  if (model !== undefined) data.model = model;

  const conversation = await prisma.aiConversation.update({
    where: { id },
    data,
  });

  return NextResponse.json({ conversation });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireModuleAccess("ai-assistant");
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.aiConversation.findFirst({
    where: { id, userId: session!.user.id },
  });
  if (!existing) {
    return NextResponse.json({ message: "会话不存在" }, { status: 404 });
  }

  await prisma.aiConversation.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
