import { getMailRelatedDashboardStats } from "@/lib/mail/dashboard-stats";
import { DashboardHome } from "@/components/dashboard/dashboard-home";

export default async function DashboardPage() {
  const { unread, openTodos } = await getMailRelatedDashboardStats();
  return (
    <DashboardHome unreadMail={unread} openTodos={openTodos} />
  );
}
