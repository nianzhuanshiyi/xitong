import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ListingWorkspace } from "@/components/listing/listing-workspace";

export default async function ListingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  return <ListingWorkspace />;
}
