import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET — single feedback detail
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const feedback = await prisma.feedback.findUnique({
    where: { id: params.id },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  if (!feedback) {
    return NextResponse.json({ message: "反馈不存在" }, { status: 404 });
  }

  // Non-admin can only see own feedback
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "ADMIN" && feedback.userId !== session.user.id) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  return NextResponse.json(feedback);
}

// PUT — update status/reply (admin only)
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = await req.json();
  const { status, reply } = body as { status?: string; reply?: string };

  const data: Record<string, unknown> = {};
  if (status) data.status = status;
  if (reply !== undefined) {
    data.reply = reply;
    data.repliedAt = new Date();
  }

  const feedback = await prisma.feedback.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json({ ok: true, feedback });
}

// DELETE — delete feedback (admin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  await prisma.feedback.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
