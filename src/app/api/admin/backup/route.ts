import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdminSession } from "@/lib/require-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "需要管理员权限" }, { status: 403 });
  }

  const tables: Record<string, unknown[]> = {};

  // Export all tables — exclude binary/large content fields, exclude password hashes
  tables.users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });
  tables.teams = await prisma.team.findMany();
  tables.accounts = await prisma.account.findMany();
  tables.sessions = await prisma.session.findMany();
  tables.suppliers = await prisma.supplier.findMany();
  tables.supplierContacts = await prisma.supplierContact.findMany();
  tables.supplierFiles = await prisma.supplierFile.findMany({
    select: { id: true, supplierId: true, storedName: true, originalName: true, mimeType: true, size: true, category: true, relativePath: true, uploadedAt: true },
  });
  tables.supplierFileAnalyses = await prisma.supplierFileAnalysis.findMany();
  tables.supplierDomains = await prisma.supplierDomain.findMany();
  tables.supplierNotes = await prisma.supplierNote.findMany();
  tables.supplierOrders = await prisma.supplierOrder.findMany();
  tables.supplierSamples = await prisma.supplierSample.findMany();
  tables.supplierQualityIssues = await prisma.supplierQualityIssue.findMany();
  tables.supplierRatingEntries = await prisma.supplierRatingEntry.findMany();
  tables.emailAccounts = await prisma.emailAccount.findMany({
    select: { id: true, email: true, displayName: true, imapHost: true, imapPort: true, smtpHost: true, smtpPort: true, isActive: true, createdAt: true },
  });
  tables.emails = await prisma.email.findMany();
  tables.emailAttachments = await prisma.emailAttachment.findMany({
    select: { id: true, emailId: true, filename: true, contentType: true, sizeBytes: true, storagePath: true },
  });
  tables.actionItems = await prisma.actionItem.findMany();
  tables.imapSyncStates = await prisma.imapSyncState.findMany();
  tables.products = await prisma.product.findMany();
  tables.productDevs = await prisma.productDev.findMany();
  tables.productDevTasks = await prisma.productDevTask.findMany();
  tables.productDevLogs = await prisma.productDevLog.findMany();
  tables.listingDrafts = await prisma.listingDraft.findMany();
  tables.smartSelectionPlans = await prisma.smartSelectionPlan.findMany();
  tables.smartSelectionScanBatches = await prisma.smartSelectionScanBatch.findMany();
  tables.smartSelectionResults = await prisma.smartSelectionResult.findMany();
  tables.smartSelectionExcludeLists = await prisma.smartSelectionExcludeList.findMany();
  tables.imageProjects = await prisma.imageProject.findMany();
  tables.generatedImages = await prisma.generatedImage.findMany();
  tables.integrationSecrets = await prisma.integrationSecret.findMany({
    select: { id: true, updatedAt: true },
  });
  tables.inviteCodes = await prisma.inviteCode.findMany();
  tables.operationLogs = await prisma.operationLog.findMany();
  tables.analysisCaches = await prisma.analysisCache.findMany();
  tables.productAnalysisReports = await prisma.productAnalysisReport.findMany();
  tables.productAnalyses = await prisma.productAnalysis.findMany();
  tables.analysisChats = await prisma.analysisChat.findMany();

  const backup = {
    exportedAt: new Date().toISOString(),
    exportedBy: session.user.email,
    tables,
  };

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `backup-${ts}.json`;
  const body = JSON.stringify(backup, null, 2);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
