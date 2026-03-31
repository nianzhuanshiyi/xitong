import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { mailUiMock } from "@/lib/mail/config";
import { MOCK_MAIL_DETAILS } from "@/lib/mail/fixtures";
import { buildMailListWhere } from "@/lib/mail/mail-list-query";
import {
  buildThreadSummaries,
  type ThreadableEmail,
} from "@/lib/mail/threading";

export const dynamic = "force-dynamic";

function mockThreadableFiltered(searchParams: URLSearchParams): ThreadableEmail[] {
  const supplierId = searchParams.get("supplierId");
  const uncategorized = searchParams.get("uncategorized") === "1";
  const bucket = searchParams.get("bucket");
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";

  let list = Object.values(MOCK_MAIL_DETAILS);
  if (supplierId) {
    list = list.filter((e) => e.supplierId === supplierId);
  } else if (uncategorized) {
    list = list.filter((e) => e.supplierId == null);
    if (bucket) list = list.filter((e) => e.aiBucket === bucket);
  }
  if (q) {
    list = list.filter(
      (e) =>
        e.subject.toLowerCase().includes(q) ||
        (e.summaryCn && e.summaryCn.toLowerCase().includes(q))
    );
  }

  return list.map((d) => ({
    id: d.id,
    messageId: `mock-${d.id}`,
    inReplyTo: d.id === "em2" ? "mock-em1" : null,
    referencesIds: d.id === "em2" ? "mock-em1" : null,
    subject: d.subject,
    supplierId: d.supplierId,
    receivedAt: new Date(d.receivedAt),
    direction: d.direction,
    summaryCn: d.summaryCn,
    isRead: d.isRead,
    isStarred: false,
    hasAttachments: d.hasAttachments,
    aiBucket: d.aiBucket,
    actionItems: (d.actionItems ?? []).map((a) => ({
      isCompleted: a.isCompleted,
    })),
  }));
}

export async function GET(req: Request) {
  const { session, error } = await requireModuleAccess("email");
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const supplierId = searchParams.get("supplierId");
  const uncategorized = searchParams.get("uncategorized") === "1";

  if (mailUiMock()) {
    const threadable = mockThreadableFiltered(searchParams);
    if (!supplierId && !uncategorized) {
      return NextResponse.json({ threads: [] });
    }
    return NextResponse.json({ threads: buildThreadSummaries(threadable) });
  }

  if (!supplierId && !uncategorized) {
    return NextResponse.json({ threads: [] });
  }

  // Get current user's account IDs for data isolation
  const userAccounts = await prisma.emailAccount.findMany({
    where: { userId: session!.user.id, isActive: true },
    select: { id: true },
  });
  const accountIds = userAccounts.map((a) => a.id);

  const where = buildMailListWhere(searchParams);
  // Filter emails to only those belonging to user's accounts
  where.accountId = accountIds.length > 0 ? { in: accountIds } : "___none___";
  const rows = await prisma.email.findMany({
    where,
    select: {
      id: true,
      supplierId: true,
      direction: true,
      subject: true,
      summaryCn: true,
      receivedAt: true,
      isRead: true,
      isStarred: true,
      hasAttachments: true,
      aiBucket: true,
      messageId: true,
      inReplyTo: true,
      referencesIds: true,
      priority: true,
      actionItems: { select: { id: true, isCompleted: true } },
      supplier: { select: { name: true } },
    },
    orderBy: { receivedAt: "desc" },
    take: 300,
  });

  const threadable: ThreadableEmail[] = rows.map((e) => ({
    id: e.id,
    messageId: e.messageId,
    inReplyTo: e.inReplyTo,
    referencesIds: e.referencesIds,
    subject: e.subject,
    supplierId: e.supplierId,
    receivedAt: e.receivedAt,
    direction: e.direction,
    summaryCn: e.summaryCn,
    isRead: e.isRead,
    isStarred: e.isStarred,
    hasAttachments: e.hasAttachments,
    aiBucket: e.aiBucket,
    actionItems: e.actionItems,
    supplier: e.supplier,
  }));

  return NextResponse.json({ threads: buildThreadSummaries(threadable) });
}
