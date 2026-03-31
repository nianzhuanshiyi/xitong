import { NextResponse } from "next/server";
import { EmailDirection } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { mailUiMock } from "@/lib/mail/config";
import { mockStats } from "@/lib/mail/fixtures";
import { inboxEmailWhere } from "@/lib/mail/inbox-filter";

export const dynamic = "force-dynamic";

export async function GET() {
  const { session, error } = await requireModuleAccess("email");
  if (error) return error;
  if (mailUiMock()) {
    return NextResponse.json(mockStats());
  }

  // Get current user's account IDs for data isolation
  const userAccounts = await prisma.emailAccount.findMany({
    where: { userId: session!.user.id, isActive: true },
    select: { id: true },
  });
  const accountIds = userAccounts.map((a) => a.id);
  if (accountIds.length === 0) {
    return NextResponse.json({ unread: 0, openTodos: 0 });
  }
  const accountFilter = { in: accountIds };

  const [unread, openTodos] = await Promise.all([
    prisma.email.count({
      where: {
        ...inboxEmailWhere(),
        isRead: false,
        direction: EmailDirection.RECEIVED,
        accountId: accountFilter,
      },
    }),
    prisma.actionItem.count({
      where: {
        isCompleted: false,
        email: { accountId: accountFilter },
      },
    }),
  ]);
  return NextResponse.json({ unread, openTodos });
}
