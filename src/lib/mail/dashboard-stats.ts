import { EmailDirection } from "@prisma/client";
import prisma from "@/lib/prisma";
import { mailUiMock } from "@/lib/mail/config";
import { mockStats } from "@/lib/mail/fixtures";
import { inboxEmailWhere } from "@/lib/mail/inbox-filter";

export async function getMailRelatedDashboardStats() {
  if (mailUiMock()) {
    const s = mockStats();
    return { unread: s.unread, openTodos: s.openTodos, beautyReport: null };
  }
  const today = new Date().toISOString().slice(0, 10);
  const [unread, openTodos, todayReport] = await Promise.all([
    prisma.email.count({
      where: {
        ...inboxEmailWhere(),
        isRead: false,
        direction: EmailDirection.RECEIVED,
      },
    }),
    prisma.actionItem.count({ where: { isCompleted: false } }),
    prisma.dailyBeautyReport.findUnique({ where: { reportDate: today } }).catch(() => null),
  ]);
  return {
    unread,
    openTodos,
    beautyReport: todayReport
      ? {
          trendsFound: todayReport.trendsFound,
          ideasGenerated: todayReport.ideasGenerated,
          highScoreIdeas: todayReport.highScoreIdeas,
          status: todayReport.status,
        }
      : null,
  };
}
