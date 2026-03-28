import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TodosWorkspace } from "@/components/todos/todos-workspace";

export default async function TodosPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  return <TodosWorkspace />;
}
