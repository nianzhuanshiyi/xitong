import { getMailRelatedDashboardStats } from "@/lib/mail/dashboard-stats";
import { DashboardHome } from "@/components/dashboard/dashboard-home";

export default async function DashboardPage() {
  const { unread, openTodos, beautyReport } = await getMailRelatedDashboardStats();
  return (
    <DashboardHome unreadMail={unread} openTodos={openTodos} beautyReport={beautyReport} />
  );
}
