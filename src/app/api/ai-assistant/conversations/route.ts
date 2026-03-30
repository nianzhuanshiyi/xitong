import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const { session, error } = await requireModuleAccess("ai-assistant");
  if (error) return error;

  const conversations = await prisma.aiConversation.findMany({
    where: { userId: session!.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      model: true,
      updatedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ conversations });
}

export async function POST(req: Request) {
  const { session, error } = await requireModuleAccess("ai-assistant");
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const { title, model } = body as { title?: string; model?: string };

  const conversation = await prisma.aiConversation.create({
    data: {
      title: title || "新对话",
      model: model || "sonnet",
      userId: session!.user.id,
    },
  });

  return NextResponse.json({ conversation });
}
