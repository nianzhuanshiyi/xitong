/*
  Warnings:

  - You are about to drop the `BeautyTrend` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DailyBeautyReport` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DailyEuropeReport` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DailyThreeCReport` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `EuropeProductIdea` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `EuropeTopPickReport` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `EuropeTrend` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `IdeaComment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `IdeaComment3C` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `IdeaCommentEurope` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProductIdea` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ThreeCProductIdea` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ThreeCTopPickReport` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ThreeCTrend` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TopPickReport` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "SupplierFile" ADD COLUMN "fileData" BLOB;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "BeautyTrend";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "DailyBeautyReport";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "DailyEuropeReport";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "DailyThreeCReport";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "EuropeProductIdea";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "EuropeTopPickReport";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "EuropeTrend";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "IdeaComment";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "IdeaComment3C";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "IdeaCommentEurope";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ProductIdea";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ThreeCProductIdea";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ThreeCTopPickReport";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ThreeCTrend";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "TopPickReport";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "ThreeCIdeaPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportDate" TEXT NOT NULL,
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
    "keyFeatures" TEXT NOT NULL DEFAULT '',
    "designSuggestion" TEXT NOT NULL DEFAULT '',
    "marketAnalysis" TEXT NOT NULL DEFAULT '',
    "competitorAnalysis" TEXT NOT NULL DEFAULT '',
    "differentiationStrategy" TEXT NOT NULL DEFAULT '',
    "estimatedRetailPrice" TEXT,
    "estimatedCogs" INTEGER,
    "estimatedFbaFee" INTEGER,
    "estimatedAdCost" INTEGER,
    "estimatedProfit" INTEGER,
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
    CONSTRAINT "ThreeCIdeaPlan_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BeautyIdeaPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportDate" TEXT NOT NULL,
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
    CONSTRAINT "BeautyIdeaPlan_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "tokenUsed" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "screenshot" TEXT,
    "module" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reply" TEXT,
    "repliedAt" DATETIME,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ThreeCIdeaPlan_createdBy_createdAt_idx" ON "ThreeCIdeaPlan"("createdBy", "createdAt");

-- CreateIndex
CREATE INDEX "ThreeCIdeaPlan_status_createdAt_idx" ON "ThreeCIdeaPlan"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BeautyIdeaPlan_createdBy_createdAt_idx" ON "BeautyIdeaPlan"("createdBy", "createdAt");

-- CreateIndex
CREATE INDEX "BeautyIdeaPlan_status_createdAt_idx" ON "BeautyIdeaPlan"("status", "createdAt");
