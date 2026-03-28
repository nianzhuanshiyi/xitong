-- CreateTable
CREATE TABLE "ProductAnalysisReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "asinsJson" TEXT NOT NULL,
    "title" TEXT,
    "score" INTEGER,
    "scoreBand" TEXT,
    "status" TEXT NOT NULL,
    "resultJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductAnalysisReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
