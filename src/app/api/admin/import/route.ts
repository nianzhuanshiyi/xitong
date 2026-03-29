import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdminSession } from "@/lib/require-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type BackupData = {
  exportedAt?: string;
  tables: Record<string, Record<string, unknown>[]>;
};

/** upsert helper: try create, skip on unique conflict */
async function upsertMany<T extends Record<string, unknown>>(
  modelDelegate: { create: (args: { data: T }) => Promise<unknown> },
  rows: T[],
  label: string,
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      await modelDelegate.create({ data: row });
      inserted++;
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      // P2002 = unique constraint violation (Prisma)
      if (code === "P2002") {
        skipped++;
      } else {
        console.error(`[import] ${label} insert error:`, e);
        skipped++;
      }
    }
  }
  return { inserted, skipped };
}

/** Convert ISO date strings back to Date objects for Prisma */
function reviveDates(obj: Record<string, unknown>): Record<string, unknown> {
  const dateFieldSuffixes = [
    "At", "Date", "date", "Until", "Since", "Time",
  ];
  const result = { ...obj };
  for (const [key, val] of Object.entries(result)) {
    if (val === null || val === undefined) continue;
    if (
      typeof val === "string" &&
      dateFieldSuffixes.some((s) => key.endsWith(s)) &&
      /^\d{4}-\d{2}-\d{2}T/.test(val)
    ) {
      result[key] = new Date(val);
    }
  }
  return result;
}

function prepRows(rows: unknown[] | undefined): Record<string, unknown>[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => reviveDates(r as Record<string, unknown>));
}

export async function POST(req: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "需要管理员权限" }, { status: 403 });
  }

  let backup: BackupData;
  try {
    backup = (await req.json()) as BackupData;
  } catch {
    return NextResponse.json({ message: "无效 JSON" }, { status: 400 });
  }

  if (!backup.tables || typeof backup.tables !== "object") {
    return NextResponse.json({ message: "缺少 tables 字段" }, { status: 400 });
  }

  const t = backup.tables;
  const stats: Record<string, { inserted: number; skipped: number }> = {};

  // Import order respects foreign key dependencies
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const importPlan: [string, any, unknown[] | undefined][] = [
    ["users", prisma.user, t.users],
    ["teams", prisma.team, t.teams],
    ["accounts", prisma.account, t.accounts],
    ["sessions", prisma.session, t.sessions],
    ["inviteCodes", prisma.inviteCode, t.inviteCodes],
    ["integrationSecrets", prisma.integrationSecret, t.integrationSecrets],
    ["suppliers", prisma.supplier, t.suppliers],
    ["supplierContacts", prisma.supplierContact, t.supplierContacts],
    ["supplierFiles", prisma.supplierFile, t.supplierFiles],
    ["supplierFileAnalyses", prisma.supplierFileAnalysis, t.supplierFileAnalyses],
    ["supplierDomains", prisma.supplierDomain, t.supplierDomains],
    ["supplierNotes", prisma.supplierNote, t.supplierNotes],
    ["supplierOrders", prisma.supplierOrder, t.supplierOrders],
    ["supplierSamples", prisma.supplierSample, t.supplierSamples],
    ["supplierQualityIssues", prisma.supplierQualityIssue, t.supplierQualityIssues],
    ["supplierRatingEntries", prisma.supplierRatingEntry, t.supplierRatingEntries],
    ["emailAccounts", prisma.emailAccount, t.emailAccounts],
    ["emails", prisma.email, t.emails],
    ["emailAttachments", prisma.emailAttachment, t.emailAttachments],
    ["actionItems", prisma.actionItem, t.actionItems],
    ["imapSyncStates", prisma.imapSyncState, t.imapSyncStates],
    ["products", prisma.product, t.products],
    ["productDevs", prisma.productDev, t.productDevs],
    ["productDevTasks", prisma.productDevTask, t.productDevTasks],
    ["productDevLogs", prisma.productDevLog, t.productDevLogs],
    ["listingDrafts", prisma.listingDraft, t.listingDrafts],
    ["smartSelectionPlans", prisma.smartSelectionPlan, t.smartSelectionPlans],
    ["smartSelectionScanBatches", prisma.smartSelectionScanBatch, t.smartSelectionScanBatches],
    ["smartSelectionResults", prisma.smartSelectionResult, t.smartSelectionResults],
    ["smartSelectionExcludeLists", prisma.smartSelectionExcludeList, t.smartSelectionExcludeLists],
    ["imageProjects", prisma.imageProject, t.imageProjects],
    ["generatedImages", prisma.generatedImage, t.generatedImages],
    ["operationLogs", prisma.operationLog, t.operationLogs],
    ["analysisCaches", prisma.analysisCache, t.analysisCaches],
    ["productAnalysisReports", prisma.productAnalysisReport, t.productAnalysisReports],
    ["productAnalyses", prisma.productAnalysis, t.productAnalyses],
    ["analysisChats", prisma.analysisChat, t.analysisChats],
  ];

  for (const [label, delegate, rows] of importPlan) {
    const prepared = prepRows(rows);
    if (prepared.length === 0) {
      stats[label] = { inserted: 0, skipped: 0 };
      continue;
    }
    stats[label] = await upsertMany(delegate, prepared, label);
  }

  const totalInserted = Object.values(stats).reduce((s, v) => s + v.inserted, 0);
  const totalSkipped = Object.values(stats).reduce((s, v) => s + v.skipped, 0);

  return NextResponse.json({
    ok: true,
    message: `导入完成：新增 ${totalInserted} 条，跳过 ${totalSkipped} 条（已存在）`,
    stats,
  });
}
