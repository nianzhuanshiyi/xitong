import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { MailWorkspace } from "@/components/mail/mail-workspace";
import { Loader2 } from "lucide-react";

export default async function MailPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <Loader2 className="size-8 animate-spin text-indigo-500" />
        </div>
      }
    >
      <MailWorkspace />
    </Suspense>
  );
}
