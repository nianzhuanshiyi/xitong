-- CreateTable
CREATE TABLE "EtsySearchTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "filtersJson" TEXT NOT NULL DEFAULT '{}',
    "totalFound" INTEGER,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EtsySearchTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EtsyProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" REAL,
    "currencyCode" TEXT,
    "shopName" TEXT NOT NULL,
    "shopUrl" TEXT,
    "shopSales" INTEGER,
    "favoriteCount" INTEGER,
    "reviewCount" INTEGER,
    "rating" REAL,
    "tagsJson" TEXT,
    "imageUrl" TEXT,
    "aiAnalyzed" BOOLEAN NOT NULL DEFAULT false,
    "aiSellingPoints" TEXT,
    "aiPricingStrategy" TEXT,
    "aiKeywords" TEXT,
    "aiTargetAudience" TEXT,
    "aiSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EtsyProduct_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "EtsySearchTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EtsySearchTask_userId_createdAt_idx" ON "EtsySearchTask"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EtsyProduct_taskId_shopSales_idx" ON "EtsyProduct"("taskId", "shopSales");

-- CreateIndex
CREATE INDEX "EtsyProduct_taskId_createdAt_idx" ON "EtsyProduct"("taskId", "createdAt");
