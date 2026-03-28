import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { mailEnvConfigured } from "@/lib/mail/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const user = process.env.EMAIL_USER?.trim();
  const { imap, smtp } = mailEnvConfigured();
  let lastSyncAt: string | null = null;
  let lastUid = 0;
  if (user) {
    const row = await prisma.imapSyncState.findUnique({
      where: { emailAccount: user },
    });
    lastSyncAt = row?.lastSyncAt?.toISOString() ?? null;
    lastUid = row?.lastUid ?? 0;
  }
  return NextResponse.json({
    imapConfigured: imap,
    smtpConfigured: smtp,
    emailAccount: user ?? null,
    lastSyncAt,
    lastUid,
  });
}
