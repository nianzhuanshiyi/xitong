/**
 * GET /api/etsy/tasks
 * 获取当前用户的所有 Etsy 搜索任务列表
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const tasks = await prisma.etsySearchTask.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      keyword: true,
      status: true,
      totalFound: true,
      errorMessage: true,
      filtersJson: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(tasks);
}
