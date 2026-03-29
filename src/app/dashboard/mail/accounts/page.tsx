import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { EmailAccountsManagement } from "./email-accounts-management";

export const dynamic = "force-dynamic";

export default async function EmailAccountsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  return <EmailAccountsManagement />;
}
