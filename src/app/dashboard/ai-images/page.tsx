import nextDynamic from "next/dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Loader2 } from "lucide-react";

const AiImagesWorkspace = nextDynamic(
  () => import("@/components/ai-images/ai-images-workspace").then((m) => m.AiImagesWorkspace),
  { loading: () => <div className="flex justify-center py-20"><Loader2 className="size-8 animate-spin text-slate-400" /></div> }
);

export const dynamic = "force-dynamic";

export default async function AiImagesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  return <AiImagesWorkspace />;
}
