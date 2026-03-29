import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Manual trigger for daily report generation.
 * Calls the same auto-scan endpoint internally.
 */
export async function POST() {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // Check if already completed today
  const existing = await prisma.dailyBeautyReport.findUnique({
    where: { reportDate: today },
  });
  if (existing && existing.status === "completed") {
    return NextResponse.json({ report: existing, skipped: true });
  }

  // Call the auto-scan endpoint
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const r = await fetch(`${baseUrl}/api/beauty-ideas/auto-scan`, {
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

  // Fetch the updated report
  const report = await prisma.dailyBeautyReport.findUnique({
    where: { reportDate: today },
  });

  return NextResponse.json({ report, ...result });
}
