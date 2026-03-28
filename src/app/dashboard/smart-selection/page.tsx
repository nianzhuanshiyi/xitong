import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { SmartSelectionWorkspace } from "@/components/smart-selection/smart-selection-workspace";

export default async function SmartSelectionPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  return <SmartSelectionWorkspace />;
}
