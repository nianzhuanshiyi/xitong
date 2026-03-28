import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AiImagesWorkspace } from "@/components/ai-images/ai-images-workspace";

export default async function AiImagesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  return <AiImagesWorkspace />;
}
