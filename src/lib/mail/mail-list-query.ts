import type { Prisma } from "@prisma/client";
import { inboxEmailWhere } from "@/lib/mail/inbox-filter";

export function buildMailListWhere(
  searchParams: URLSearchParams
): Prisma.EmailWhereInput {
  const supplierId = searchParams.get("supplierId");
  const uncategorized = searchParams.get("uncategorized") === "1";
  const bucket = searchParams.get("bucket");
  const q = searchParams.get("q")?.trim() ?? "";

  const where: Prisma.EmailWhereInput = { ...inboxEmailWhere() };
  if (supplierId) where.supplierId = supplierId;
  else if (uncategorized) {
    where.supplierId = null;
    if (bucket) where.aiBucket = bucket;
  }
  if (q) {
    where.OR = [
      { subject: { contains: q } },
      { summaryCn: { contains: q } },
      { bodyText: { contains: q } },
    ];
  }
  return where;
}
