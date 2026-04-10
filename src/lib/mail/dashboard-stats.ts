import { EmailDirection } from "@prisma/client";
import prisma from "@/lib/prisma";
import { mailUiMock } from "@/lib/mail/config";
import { mockStats } from "@/lib/mail/fixtures";
import { inboxEmailWhere } from "@/lib/mail/inbox-filter";

export async function getMailRelatedDashboardStats(userId?: string) {
  if (mailUiMock()) {
    const s = mockStats();
    return { unread: s.unread, openTodos: s.openTodos, beautyReport: null };
  }
  // Build user-scoped email account filter
  let emailAccountFilter: { in: string[] } | undefined;
  if (userId) {
    const userAccounts = await prisma.emailAccount.findMany({
      where: { userId, isActive: true },
      select: { id: true },
    });
    const accountIds = userAccounts.map((a) => a.id);
    emailAccountFilter = accountIds.length > 0 ? { in: accountIds } : undefined;
  }

  const [unread, openTodos] = await Promise.all([
    emailAccountFilter
      ? prisma.email.count({
          where: {
            ...inboxEmailWhere(),
            isRead: false,
            direction: EmailDirection.RECEIVED,
            accountId: emailAccountFilter,
          },
        })
      : Promise.resolve(0),
    prisma.actionItem.count({
      where: {
        isCompleted: false,
        ...(userId ? { userId } : {}),
      },
    }),
  ]);
  return {
    unread,
    openTodos,
  };
}
