-- CreateTable
CREATE TABLE "IntegrationSecret" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "claudeApiKey" TEXT,
    "sellerspriteSecret" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
