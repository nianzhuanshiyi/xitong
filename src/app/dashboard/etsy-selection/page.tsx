import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { EtsySelectionWorkspace } from "@/components/etsy-selection/etsy-selection-workspace";

export default async function EtsySelectionPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  return <EtsySelectionWorkspace />;
}
