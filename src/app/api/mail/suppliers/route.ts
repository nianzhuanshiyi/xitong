import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { mailUiMock } from "@/lib/mail/config";
import { MOCK_MAIL_SUPPLIERS } from "@/lib/mail/fixtures";
import { EmailDirection } from "@prisma/client";
import { inboxEmailWhere } from "@/lib/mail/inbox-filter";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireModuleAccess("email");
  if (error) return error;
  if (mailUiMock()) {
    return NextResponse.json(MOCK_MAIL_SUPPLIERS);
  }

  const suppliers = await prisma.supplier.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      updatedAt: true,
      emails: {
        where: inboxEmailWhere(),
        orderBy: { receivedAt: "desc" },
        take: 1,
        select: { summaryCn: true, subject: true, receivedAt: true },
      },
    },
  });

  const unreadRows = await prisma.email.groupBy({
    by: ["supplierId"],
    where: {
      ...inboxEmailWhere(),
      supplierId: { not: null },
      isRead: false,
      direction: EmailDirection.RECEIVED,
    },
    _count: true,
  });
  const unreadMap = new Map(
    unreadRows
      .filter((r) => r.supplierId)
      .map((r) => [r.supplierId as string, r._count])
  );

  const rows = suppliers
    .map((s) => {
      const last = s.emails[0];
      return {
        id: s.id,
        name: s.name,
        status: s.status,
        unreadCount: unreadMap.get(s.id) ?? 0,
        lastSnippet: last?.summaryCn || last?.subject || "",
        lastAt: (last?.receivedAt ?? s.updatedAt).toISOString(),
      };
    })
    .sort(
      (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
    );

  return NextResponse.json(rows);
}
