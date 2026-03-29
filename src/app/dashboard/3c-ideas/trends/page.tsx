import nextDynamic from "next/dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Loader2 } from "lucide-react";

const ThreeCTrends = nextDynamic(
  () => import("@/components/3c-ideas/threec-trends").then((m) => m.ThreeCTrends),
  { loading: () => <div className="flex justify-center py-20"><Loader2 className="size-8 animate-spin text-slate-400" /></div> }
);

export const dynamic = "force-dynamic";

export default async function ThreeCTrendsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  return <ThreeCTrends />;
}
