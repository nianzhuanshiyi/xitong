import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { InviteCodesManagement } from "./invite-codes-management";

export const dynamic = "force-dynamic";

export default async function InviteCodesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return <InviteCodesManagement />;
}
