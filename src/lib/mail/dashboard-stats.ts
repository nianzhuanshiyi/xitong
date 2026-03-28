import { EmailDirection } from "@prisma/client";
import prisma from "@/lib/prisma";
import { mailUiMock } from "@/lib/mail/config";
import { mockStats } from "@/lib/mail/fixtures";
import { inboxEmailWhere } from "@/lib/mail/inbox-filter";

export async function getMailRelatedDashboardStats() {
  if (mailUiMock()) {
    const s = mockStats();
    return { unread: s.unread, openTodos: s.openTodos };
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
  return { unread, openTodos };
}
