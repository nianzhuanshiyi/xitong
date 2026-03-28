import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { SuppliersDashboard } from "@/components/suppliers/suppliers-dashboard";

export default async function SuppliersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  return <SuppliersDashboard />;
}
