import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/supplier-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Redirects to the new streamlined top-pick flow.
 * Kept for backward compatibility.
 */
export async function POST() {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const r = await fetch(`${baseUrl}/api/beauty-ideas/top-pick`, {
    method: "POST",
    headers: {
      "x-auto-sync-secret": process.env.AUTO_SYNC_SECRET || "__internal__",
    },
  });

  const result = await r.json();
  if (!r.ok) {
    return NextResponse.json(
      { message: result.message ?? "生成失败" },
      { status: 500 }
    );
  }

  return NextResponse.json(result);
}
