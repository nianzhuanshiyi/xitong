import dynamic from "next/dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Loader2 } from "lucide-react";

const SuppliersDashboard = dynamic(
  () => import("@/components/suppliers/suppliers-dashboard").then((m) => m.SuppliersDashboard),
  { loading: () => <div className="flex justify-center py-20"><Loader2 className="size-8 animate-spin text-slate-400" /></div> }
);

export default async function SuppliersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  return <SuppliersDashboard />;
}
