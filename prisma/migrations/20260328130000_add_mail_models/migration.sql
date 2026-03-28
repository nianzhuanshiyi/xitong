-- CreateTable
CREATE TABLE "ImageProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "referencePathsJson" TEXT NOT NULL DEFAULT '[]',
    "bundlePlanJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImageProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GeneratedImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "imageType" TEXT NOT NULL,
    "promptEn" TEXT NOT NULL,
    "promptZh" TEXT NOT NULL DEFAULT '',
    "paramsJson" TEXT NOT NULL DEFAULT '{}',
    "filePath" TEXT NOT NULL,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "sortPosition" INTEGER,
    "parentImageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedImage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ImageProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ListingDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "inputJson" TEXT NOT NULL,
    "resultJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ListingDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SmartSelectionPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "category" TEXT,
    "filtersJson" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SmartSelectionPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SmartSelectionScanBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "statsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SmartSelectionScanBatch_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SmartSelectionPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SmartSelectionResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "batchId" TEXT,
    "asin" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "productJson" TEXT NOT NULL,
    "imageUrl" TEXT,
    "title" TEXT,
    "price" REAL,
    "bsr" INTEGER,
    "rating" REAL,
    "reviewCount" INTEGER,
    "monthlySales" INTEGER,
    "aiScore" INTEGER,
    "aiSummary" TEXT,
    "aiJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECOMMENDED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SmartSelectionResult_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SmartSelectionPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SmartSelectionResult_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SmartSelectionScanBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SmartSelectionExcludeList" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "asin" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SmartSelectionExcludeList_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SmartSelectionPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Email" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT,
    "messageId" TEXT NOT NULL,
    "inReplyTo" TEXT,
    "referencesIds" TEXT,
    "direction" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL DEFAULT '',
    "bodyHtml" TEXT,
    "bodyZh" TEXT,
    "receivedAt" DATETIME NOT NULL,
    "summaryCn" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "aiBucket" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isClassified" BOOLEAN NOT NULL DEFAULT false,
    "imapUid" INTEGER,
    "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Email_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailAttachment_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailId" TEXT,
    "supplierId" TEXT,
    "userId" TEXT,
    "content" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" DATETIME,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActionItem_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ActionItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ActionItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierDomain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierDomain_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImapSyncState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailAccount" TEXT NOT NULL,
    "lastUid" INTEGER NOT NULL DEFAULT 0,
    "lastSyncAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ListingDraft_userId_updatedAt_idx" ON "ListingDraft"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SmartSelectionPlan_slug_key" ON "SmartSelectionPlan"("slug");

-- CreateIndex
CREATE INDEX "SmartSelectionScanBatch_planId_createdAt_idx" ON "SmartSelectionScanBatch"("planId", "createdAt");

-- CreateIndex
CREATE INDEX "SmartSelectionResult_planId_asin_idx" ON "SmartSelectionResult"("planId", "asin");

-- CreateIndex
CREATE INDEX "SmartSelectionResult_planId_status_createdAt_idx" ON "SmartSelectionResult"("planId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SmartSelectionResult_batchId_idx" ON "SmartSelectionResult"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "SmartSelectionExcludeList_planId_asin_key" ON "SmartSelectionExcludeList"("planId", "asin");

-- CreateIndex
CREATE UNIQUE INDEX "Email_messageId_key" ON "Email"("messageId");

-- CreateIndex
CREATE INDEX "Email_supplierId_receivedAt_idx" ON "Email"("supplierId", "receivedAt");

-- CreateIndex
CREATE INDEX "Email_supplierId_isRead_idx" ON "Email"("supplierId", "isRead");

-- CreateIndex
CREATE INDEX "Email_receivedAt_idx" ON "Email"("receivedAt");

-- CreateIndex
CREATE INDEX "ActionItem_supplierId_isCompleted_idx" ON "ActionItem"("supplierId", "isCompleted");

-- CreateIndex
CREATE INDEX "ActionItem_isCompleted_priority_idx" ON "ActionItem"("isCompleted", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierDomain_domain_key" ON "SupplierDomain"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "ImapSyncState_emailAccount_key" ON "ImapSyncState"("emailAccount");
