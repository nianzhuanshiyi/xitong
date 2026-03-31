import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";

const ActivityLogDashboard = dynamic(
  () => import("./activity-log-dashboard").then((m) => m.ActivityLogDashboard),
  { ssr: false }
);

export default async function ActivityLogsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return <ActivityLogDashboard />;
}
