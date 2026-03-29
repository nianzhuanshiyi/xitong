import nextDynamic from "next/dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Loader2 } from "lucide-react";

const BeautyIdeasDashboard = nextDynamic(
  () => import("@/components/beauty-ideas/beauty-ideas-dashboard").then((m) => m.BeautyIdeasDashboard),
  { loading: () => <div className="flex justify-center py-20"><Loader2 className="size-8 animate-spin text-slate-400" /></div> }
);

export const dynamic = "force-dynamic";

export default async function BeautyIdeasPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  return <BeautyIdeasDashboard />;
}
