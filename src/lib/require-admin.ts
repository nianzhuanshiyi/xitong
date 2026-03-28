import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function requireAdminSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "ADMIN") return null;
  return session;
}
