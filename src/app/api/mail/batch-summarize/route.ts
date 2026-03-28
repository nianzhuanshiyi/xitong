import { NextResponse } from "next/server";
import { EmailDirection } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { inboxEmailWhere } from "@/lib/mail/inbox-filter";
import { applyAiSummaryToEmail } from "@/lib/mail/imap-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const rows = await prisma.email.findMany({
    where: {
      ...inboxEmailWhere(),
      direction: EmailDirection.RECEIVED,
      OR: [
        { summaryCn: null },
        { summaryCn: "" },
        { bodyZh: null },
        { bodyZh: "" },
      ],
    },
    select: { id: true, bodyText: true },
    take: 35,
    orderBy: { receivedAt: "desc" },
  });

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const t = row.bodyText?.trim() ?? "";
    if (t.length < 10) {
      skipped += 1;
      continue;
    }
    const r = await applyAiSummaryToEmail(row.id, { force: true });
    if (r === "success" || r === "already") ok += 1;
    else if (r === "skipped_empty" || r === "skipped_short") skipped += 1;
    else failed += 1;
  }

  return NextResponse.json({
    ok: true,
    processed: rows.length,
    successOrSkip: ok + skipped,
    failed,
    note: `处理 ${rows.length} 封：完成/跳过 ${ok + skipped}，失败 ${failed}`,
  });
}
