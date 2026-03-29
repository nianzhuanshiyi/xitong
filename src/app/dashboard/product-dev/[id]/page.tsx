import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ProductDevDetail } from "@/components/product-dev/product-dev-detail";

export const dynamic = "force-dynamic";

export default async function ProductDevDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const { id } = await params;
  return <ProductDevDetail id={id} />;
}
