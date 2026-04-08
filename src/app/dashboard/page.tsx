import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMailRelatedDashboardStats } from "@/lib/mail/dashboard-stats";
import { DashboardHome } from "@/components/dashboard/dashboard-home";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const { unread, openTodos } = await getMailRelatedDashboardStats(userId);
  return (
    <DashboardHome unreadMail={unread} openTodos={openTodos} />
  );
}
