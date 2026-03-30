import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { mailUiMock } from "@/lib/mail/config";
import { MOCK_MAIL_DETAILS } from "@/lib/mail/fixtures";
import { emailDetail } from "@/lib/mail/dto";
import { buildMailListWhere } from "@/lib/mail/mail-list-query";
import {
  getThreadMemberIds,
  type ThreadableEmail,
} from "@/lib/mail/threading";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ threadId: string }> };

function mockThreadableFromDetails(): ThreadableEmail[] {
  return Object.values(MOCK_MAIL_DETAILS).map((d) => ({
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

export async function GET(req: Request, ctx: Ctx) {
  const { error } = await requireModuleAccess("email");
  if (error) return error;
  const { threadId } = await ctx.params;
  const { searchParams } = new URL(req.url);

  if (mailUiMock()) {
    const all = mockThreadableFromDetails();
    let filtered = all;
    const supplierId = searchParams.get("supplierId");
    const uncategorized = searchParams.get("uncategorized") === "1";
    const bucket = searchParams.get("bucket");
    if (supplierId) {
      filtered = filtered.filter((e) => e.supplierId === supplierId);
    } else if (uncategorized) {
      filtered = filtered.filter((e) => e.supplierId == null);
      if (bucket) filtered = filtered.filter((e) => e.aiBucket === bucket);
    }
    const memberIds = new Set(getThreadMemberIds(filtered, threadId));
    const emails = Object.values(MOCK_MAIL_DETAILS)
      .filter((d) => memberIds.has(d.id))
      .sort(
        (a, b) =>
          new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
      );
    return NextResponse.json({ emails });
  }

  const where = buildMailListWhere(searchParams);
  const rows = await prisma.email.findMany({
    where,
    include: {
      actionItems: true,
      attachments: true,
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
  }));

  const memberIds = getThreadMemberIds(threadable, threadId);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = memberIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .sort(
      (a, b) => a!.receivedAt.getTime() - b!.receivedAt.getTime()
    ) as typeof rows;

  return NextResponse.json({
    emails: ordered.map((e) => emailDetail(e)),
  });
}
