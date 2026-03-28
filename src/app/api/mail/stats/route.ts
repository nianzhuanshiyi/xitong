import { NextResponse } from "next/server";
import { EmailDirection } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { mailUiMock } from "@/lib/mail/config";
import { mockStats } from "@/lib/mail/fixtures";
import { inboxEmailWhere } from "@/lib/mail/inbox-filter";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  if (mailUiMock()) {
    return NextResponse.json(mockStats());
  }
  const [unread, openTodos] = await Promise.all([
    prisma.email.count({
      where: {
        ...inboxEmailWhere(),
        isRead: false,
        direction: EmailDirection.RECEIVED,
      },
    }),
    prisma.actionItem.count({ where: { isCompleted: false } }),
  ]);
  return NextResponse.json({ unread, openTodos });
}
