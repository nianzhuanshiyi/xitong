import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET — list feedback (user sees own, admin sees all)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  const isAdmin = user?.role === "ADMIN";

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = 50;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  // Non-admin only sees own feedback
  if (!isAdmin) {
    where.userId = session.user.id;
  } else {
    // Admin filters
    const filterStatus = url.searchParams.get("status");
    const filterType = url.searchParams.get("type");
    const filterModule = url.searchParams.get("module");
    const filterUserId = url.searchParams.get("userId");
    if (filterStatus) where.status = filterStatus;
    if (filterType) where.type = filterType;
    if (filterModule) where.module = filterModule;
    if (filterUserId) where.userId = filterUserId;
  }

  const [items, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.feedback.count({ where }),
  ]);

  // Also return user list for admin filters
  let users: { id: string; name: string | null }[] = [];
  if (isAdmin) {
    users = await prisma.user.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  return NextResponse.json({
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    isAdmin,
    users,
  });
}

// POST — submit feedback
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = await req.json();
  const { type, title, description, screenshot, module: feedbackModule } = body as {
    type: string;
    title: string;
    description: string;
    screenshot?: string;
    module?: string;
  };

  if (!type || !title?.trim() || !description?.trim()) {
    return NextResponse.json({ message: "请填写完整信息" }, { status: 400 });
  }

  const feedback = await prisma.feedback.create({
    data: {
      type,
      title: title.trim(),
      description: description.trim(),
      screenshot: screenshot || null,
      module: feedbackModule || null,
      userId: session.user.id,
    },
  });

  return NextResponse.json({ ok: true, id: feedback.id });
}
