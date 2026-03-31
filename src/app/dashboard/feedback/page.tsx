import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";

const FeedbackDashboard = dynamic(
  () => import("./feedback-dashboard").then((m) => m.FeedbackDashboard),
  { ssr: false }
);

export default async function FeedbackPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return <FeedbackDashboard />;
}
