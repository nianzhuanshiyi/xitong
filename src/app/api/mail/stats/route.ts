import { NextResponse } from "next/server";
import { EmailDirection } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { mailUiMock } from "@/lib/mail/config";
import { mockStats } from "@/lib/mail/fixtures";
import { inboxEmailWhere } from "@/lib/mail/inbox-filter";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireModuleAccess("email");
  if (error) return error;
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
