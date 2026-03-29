import { NextResponse } from "next/server";
import { runImapSync } from "@/lib/mail/imap-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  // Only allow internal calls with the correct secret
  const secret = req.headers.get("x-auto-sync-secret");
  const expected = process.env.AUTO_SYNC_SECRET || "__internal__";
  if (secret !== expected) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runImapSync();
    return NextResponse.json({
      ok: true,
      imported: result.imported,
      analyzed: result.analyzed,
      aiSkipped: result.aiSkipped ?? 0,
      aiFailed: result.aiFailed ?? 0,
      error: result.error ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "sync failed" },
      { status: 500 }
    );
  }
}
