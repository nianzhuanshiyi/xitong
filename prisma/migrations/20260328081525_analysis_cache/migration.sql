-- CreateTable
CREATE TABLE "AnalysisCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cacheKey" TEXT NOT NULL,
    "asin" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "analysisData" TEXT NOT NULL,
    "reportMarkdown" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "analyzedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AnalysisCache_analyzedById_fkey" FOREIGN KEY ("analyzedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisCache_cacheKey_key" ON "AnalysisCache"("cacheKey");

-- CreateIndex
CREATE INDEX "AnalysisCache_asin_idx" ON "AnalysisCache"("asin");

-- CreateIndex
CREATE INDEX "AnalysisCache_marketplace_idx" ON "AnalysisCache"("marketplace");

-- CreateIndex
CREATE INDEX "AnalysisCache_expiresAt_idx" ON "AnalysisCache"("expiresAt");
