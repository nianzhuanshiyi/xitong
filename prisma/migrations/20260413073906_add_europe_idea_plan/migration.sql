-- CreateTable
CREATE TABLE "EuropeIdeaPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportDate" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL DEFAULT 'DE',
    "keywordsData" TEXT NOT NULL DEFAULT '[]',
    "qualifiedKeywords" TEXT NOT NULL DEFAULT '[]',
    "competitorProducts" TEXT NOT NULL DEFAULT '[]',
    "selectedKeyword" TEXT NOT NULL DEFAULT '',
    "searchVolume" INTEGER,
    "supplyDemandRatio" REAL,
    "clickConcentration" REAL,
    "productName" TEXT NOT NULL DEFAULT '',
    "productNameEn" TEXT NOT NULL DEFAULT '',
    "executiveSummary" TEXT NOT NULL DEFAULT '',
    "targetMarket" TEXT NOT NULL DEFAULT '',
    "regulatoryNotes" TEXT NOT NULL DEFAULT '',
    "keyFeatures" TEXT NOT NULL DEFAULT '',
    "designSuggestion" TEXT NOT NULL DEFAULT '',
    "marketAnalysis" TEXT NOT NULL DEFAULT '',
    "competitorAnalysis" TEXT NOT NULL DEFAULT '',
    "differentiationStrategy" TEXT NOT NULL DEFAULT '',
    "estimatedRetailPrice" TEXT,
    "estimatedCogs" TEXT,
    "estimatedFbaFee" TEXT,
    "estimatedAdCost" TEXT,
    "estimatedProfit" TEXT,
    "estimatedMargin" TEXT,
    "breakEvenUnits" INTEGER,
    "supplierPlan" TEXT NOT NULL DEFAULT '',
    "timelinePlan" TEXT NOT NULL DEFAULT '[]',
    "listingPlan" TEXT NOT NULL DEFAULT '',
    "launchStrategy" TEXT NOT NULL DEFAULT '',
    "riskAssessment" TEXT NOT NULL DEFAULT '',
    "marketScore" INTEGER NOT NULL DEFAULT 0,
    "competitionScore" INTEGER NOT NULL DEFAULT 0,
    "trendScore" INTEGER NOT NULL DEFAULT 0,
    "profitScore" INTEGER NOT NULL DEFAULT 0,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "recommendation" TEXT NOT NULL DEFAULT 'watch',
    "competitionLevel" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'generating',
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EuropeIdeaPlan_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EuropeIdeaPlan_createdBy_createdAt_idx" ON "EuropeIdeaPlan"("createdBy", "createdAt");

-- CreateIndex
CREATE INDEX "EuropeIdeaPlan_status_createdAt_idx" ON "EuropeIdeaPlan"("status", "createdAt");
