import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { GeminiAiImagesWorkspace } from "@/components/ai-images/gemini-ai-images-workspace";

export const dynamic = "force-dynamic";

export default async function AiImagesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  return <GeminiAiImagesWorkspace />;
}
