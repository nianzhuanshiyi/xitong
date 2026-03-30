-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" DATETIME,
    "image" TEXT,
    "password" TEXT,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "aiAuthorized" BOOLEAN NOT NULL DEFAULT true,
    "assignedModel" TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
    "monthlyTokenLimit" INTEGER NOT NULL DEFAULT 500000,
    "allowedModules" TEXT,
    "teamId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImageProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "asin" TEXT,
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
    "prompt" TEXT NOT NULL DEFAULT '',
    "fullPrompt" TEXT NOT NULL DEFAULT '',
    "promptEn" TEXT NOT NULL,
    "promptZh" TEXT NOT NULL DEFAULT '',
    "paramsJson" TEXT NOT NULL DEFAULT '{}',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "imageData" TEXT,
    "style" TEXT NOT NULL DEFAULT 'main_image',
    "status" TEXT NOT NULL DEFAULT 'completed',
    "width" INTEGER NOT NULL DEFAULT 1024,
    "height" INTEGER NOT NULL DEFAULT 1024,
    "filePath" TEXT NOT NULL DEFAULT '',
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

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tokenUsed" INTEGER NOT NULL DEFAULT 0,
    "tokenLimit" INTEGER NOT NULL DEFAULT 100000,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "country" TEXT NOT NULL,
    "countryCode" TEXT,
    "website" TEXT,
    "address" TEXT,
    "mainCategories" TEXT,
    "contact" TEXT,
    "paymentTerms" TEXT,
    "moq" TEXT,
    "sampleLeadDays" INTEGER,
    "productionLeadDays" INTEGER,
    "cooperationStartDate" DATETIME,
    "remarks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'EVALUATING',
    "overallScore" REAL,
    "logoUrl" TEXT,
    "profileSummary" TEXT,
    "aiEvaluationJson" TEXT,
    "websiteScrapedAt" DATETIME,
    "lastActivityAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EmailAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "imapHost" TEXT NOT NULL,
    "imapPort" INTEGER NOT NULL DEFAULT 993,
    "imapPassword" TEXT NOT NULL,
    "smtpHost" TEXT,
    "smtpPort" INTEGER DEFAULT 465,
    "smtpPassword" TEXT,
    "signature" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmailAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Email" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT,
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
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "isStarred" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "imapUid" INTEGER,
    "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Email_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
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
    "emailAccount" TEXT,
    "accountId" TEXT,
    "lastUid" INTEGER NOT NULL DEFAULT 0,
    "lastSyncAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImapSyncState_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "wechat" TEXT,
    "whatsapp" TEXT,
    "lineId" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupplierContact_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "relativePath" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierFile_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierFileAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileId" TEXT NOT NULL,
    "summary" TEXT,
    "structuredJson" TEXT,
    "complianceNotes" TEXT,
    "certExpiryDate" DATETIME,
    "rawResponse" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierFileAnalysis_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "SupplierFile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierRatingEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT NOT NULL,
    "quality" INTEGER NOT NULL,
    "priceCompete" INTEGER NOT NULL,
    "delivery" INTEGER NOT NULL,
    "communication" INTEGER NOT NULL,
    "cooperation" INTEGER NOT NULL,
    "rdCapability" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierRatingEntry_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT NOT NULL,
    "orderDate" DATETIME NOT NULL,
    "productDesc" TEXT NOT NULL,
    "quantity" INTEGER,
    "amount" REAL,
    "currency" TEXT DEFAULT 'USD',
    "status" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupplierOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierSample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT NOT NULL,
    "sampleDate" DATETIME NOT NULL,
    "productDesc" TEXT NOT NULL,
    "status" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierSample_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierQualityIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT NOT NULL,
    "issueDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "severity" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierQualityIssue_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierNote_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "asin" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "supplierId" TEXT,
    "analysisData" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OperationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InviteCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "IntegrationSecret" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "claudeApiKey" TEXT,
    "sellerspriteSecret" TEXT,
    "aiAssistantModel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProductDev" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "asin" TEXT,
    "category" TEXT,
    "targetMarket" TEXT NOT NULL DEFAULT 'US',
    "status" TEXT NOT NULL DEFAULT 'idea',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "description" TEXT,
    "targetPrice" REAL,
    "estimatedCost" REAL,
    "estimatedProfit" REAL,
    "moq" INTEGER,
    "competitorAsins" TEXT,
    "marketSize" TEXT,
    "competitionLevel" TEXT,
    "supplierName" TEXT,
    "supplierContact" TEXT,
    "sampleStatus" TEXT,
    "sampleCost" REAL,
    "diffPoints" TEXT,
    "painPoints" TEXT,
    "ideaDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetLaunchDate" DATETIME,
    "actualLaunchDate" DATETIME,
    "notes" TEXT,
    "imageUrl" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProductDevTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'todo',
    "assignee" TEXT,
    "dueDate" DATETIME,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductDevTask_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ProductDev" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductDevLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductDevLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ProductDev" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailId" TEXT,
    "supplierId" TEXT,
    "createdById" TEXT NOT NULL,
    "productName" TEXT NOT NULL DEFAULT '',
    "query" TEXT NOT NULL,
    "analysisResult" TEXT,
    "marketData" TEXT,
    "score" INTEGER,
    "recommendation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductAnalysis_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProductAnalysis_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProductAnalysis_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnalysisChat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalysisChat_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "ProductAnalysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BeautyTrend" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "ingredients" TEXT NOT NULL DEFAULT '[]',
    "category" TEXT NOT NULL,
    "trendScore" INTEGER NOT NULL DEFAULT 50,
    "sourceUrl" TEXT,
    "scannedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProductIdea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trendId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "targetMarket" TEXT NOT NULL DEFAULT 'US',
    "keyIngredients" TEXT NOT NULL DEFAULT '[]',
    "sellingPoints" TEXT NOT NULL DEFAULT '[]',
    "estimatedPrice" TEXT,
    "estimatedCost" TEXT,
    "marketData" TEXT,
    "searchVolume" INTEGER,
    "competitionLevel" TEXT,
    "avgPrice" REAL,
    "avgRating" REAL,
    "topCompetitors" TEXT NOT NULL DEFAULT '[]',
    "trendScore" INTEGER NOT NULL DEFAULT 0,
    "marketScore" INTEGER NOT NULL DEFAULT 0,
    "competitionScore" INTEGER NOT NULL DEFAULT 0,
    "profitScore" INTEGER NOT NULL DEFAULT 0,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "recommendation" TEXT NOT NULL DEFAULT 'watch',
    "aiAnalysis" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductIdea_trendId_fkey" FOREIGN KEY ("trendId") REFERENCES "BeautyTrend" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProductIdea_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IdeaComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ideaId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdeaComment_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "ProductIdea" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IdeaComment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TopPickReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportDate" TEXT NOT NULL,
    "ideaId" TEXT,
    "productName" TEXT NOT NULL DEFAULT '',
    "productNameEn" TEXT NOT NULL DEFAULT '',
    "executiveSummary" TEXT NOT NULL DEFAULT '',
    "productSpec" TEXT NOT NULL DEFAULT '{}',
    "keyIngredients" TEXT NOT NULL DEFAULT '',
    "formulaSuggestion" TEXT NOT NULL DEFAULT '',
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
    "status" TEXT NOT NULL DEFAULT 'generating',
    "phase" TEXT NOT NULL DEFAULT 'brief',
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "dismissedCategories" TEXT NOT NULL DEFAULT '',
    "briefIngredients" TEXT NOT NULL DEFAULT '',
    "briefCompetition" TEXT NOT NULL DEFAULT '',
    "briefScore" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TopPickReport_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "ProductIdea" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TopPickReport_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyBeautyReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportDate" TEXT NOT NULL,
    "trendsFound" INTEGER NOT NULL DEFAULT 0,
    "ideasGenerated" INTEGER NOT NULL DEFAULT 0,
    "highScoreIdeas" INTEGER NOT NULL DEFAULT 0,
    "trendsSummary" TEXT NOT NULL DEFAULT '',
    "ideasSummary" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ThreeCTrend" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "keywords" TEXT NOT NULL DEFAULT '[]',
    "category" TEXT NOT NULL,
    "trendScore" INTEGER NOT NULL DEFAULT 50,
    "sourceUrl" TEXT,
    "scannedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ThreeCProductIdea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trendId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "targetMarket" TEXT NOT NULL DEFAULT 'US',
    "keyFeatures" TEXT NOT NULL DEFAULT '[]',
    "sellingPoints" TEXT NOT NULL DEFAULT '[]',
    "estimatedPrice" TEXT,
    "estimatedCost" TEXT,
    "marketData" TEXT,
    "searchVolume" INTEGER,
    "competitionLevel" TEXT,
    "avgPrice" REAL,
    "avgRating" REAL,
    "topCompetitors" TEXT NOT NULL DEFAULT '[]',
    "trendScore" INTEGER NOT NULL DEFAULT 0,
    "marketScore" INTEGER NOT NULL DEFAULT 0,
    "competitionScore" INTEGER NOT NULL DEFAULT 0,
    "profitScore" INTEGER NOT NULL DEFAULT 0,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "recommendation" TEXT NOT NULL DEFAULT 'watch',
    "aiAnalysis" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ThreeCProductIdea_trendId_fkey" FOREIGN KEY ("trendId") REFERENCES "ThreeCTrend" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ThreeCProductIdea_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IdeaComment3C" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ideaId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdeaComment3C_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "ThreeCProductIdea" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IdeaComment3C_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ThreeCTopPickReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportDate" TEXT NOT NULL,
    "ideaId" TEXT,
    "productName" TEXT NOT NULL DEFAULT '',
    "productNameEn" TEXT NOT NULL DEFAULT '',
    "executiveSummary" TEXT NOT NULL DEFAULT '',
    "productSpec" TEXT NOT NULL DEFAULT '{}',
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
    "status" TEXT NOT NULL DEFAULT 'generating',
    "phase" TEXT NOT NULL DEFAULT 'brief',
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "dismissedCategories" TEXT NOT NULL DEFAULT '',
    "briefFeatures" TEXT NOT NULL DEFAULT '',
    "briefCompetition" TEXT NOT NULL DEFAULT '',
    "briefScore" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ThreeCTopPickReport_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "ThreeCProductIdea" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ThreeCTopPickReport_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyThreeCReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportDate" TEXT NOT NULL,
    "trendsFound" INTEGER NOT NULL DEFAULT 0,
    "ideasGenerated" INTEGER NOT NULL DEFAULT 0,
    "highScoreIdeas" INTEGER NOT NULL DEFAULT 0,
    "trendsSummary" TEXT NOT NULL DEFAULT '',
    "ideasSummary" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EuropeTrend" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "keywords" TEXT NOT NULL DEFAULT '[]',
    "category" TEXT NOT NULL,
    "trendScore" INTEGER NOT NULL DEFAULT 50,
    "sourceUrl" TEXT,
    "scannedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EuropeProductIdea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trendId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "targetMarket" TEXT NOT NULL DEFAULT 'DE',
    "keyFeatures" TEXT NOT NULL DEFAULT '[]',
    "sellingPoints" TEXT NOT NULL DEFAULT '[]',
    "estimatedPrice" TEXT,
    "estimatedCost" TEXT,
    "marketData" TEXT,
    "searchVolume" INTEGER,
    "competitionLevel" TEXT,
    "avgPrice" REAL,
    "avgRating" REAL,
    "topCompetitors" TEXT NOT NULL DEFAULT '[]',
    "trendScore" INTEGER NOT NULL DEFAULT 0,
    "marketScore" INTEGER NOT NULL DEFAULT 0,
    "competitionScore" INTEGER NOT NULL DEFAULT 0,
    "profitScore" INTEGER NOT NULL DEFAULT 0,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "recommendation" TEXT NOT NULL DEFAULT 'watch',
    "aiAnalysis" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EuropeProductIdea_trendId_fkey" FOREIGN KEY ("trendId") REFERENCES "EuropeTrend" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EuropeProductIdea_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IdeaCommentEurope" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ideaId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdeaCommentEurope_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "EuropeProductIdea" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IdeaCommentEurope_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EuropeTopPickReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportDate" TEXT NOT NULL,
    "ideaId" TEXT,
    "productName" TEXT NOT NULL DEFAULT '',
    "productNameEn" TEXT NOT NULL DEFAULT '',
    "executiveSummary" TEXT NOT NULL DEFAULT '',
    "productSpec" TEXT NOT NULL DEFAULT '{}',
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
    "status" TEXT NOT NULL DEFAULT 'generating',
    "phase" TEXT NOT NULL DEFAULT 'brief',
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "dismissedCategories" TEXT NOT NULL DEFAULT '',
    "briefFeatures" TEXT NOT NULL DEFAULT '',
    "briefCompetition" TEXT NOT NULL DEFAULT '',
    "briefScore" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EuropeTopPickReport_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "EuropeProductIdea" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EuropeTopPickReport_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyEuropeReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportDate" TEXT NOT NULL,
    "trendsFound" INTEGER NOT NULL DEFAULT 0,
    "ideasGenerated" INTEGER NOT NULL DEFAULT 0,
    "highScoreIdeas" INTEGER NOT NULL DEFAULT 0,
    "trendsSummary" TEXT NOT NULL DEFAULT '',
    "ideasSummary" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL DEFAULT '新对话',
    "userId" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'sonnet',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AiMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "model" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiTokenUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "estimatedCost" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AuCompetitorStore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "sellerId" TEXT NOT NULL,
    "storeUrl" TEXT NOT NULL,
    "notes" TEXT,
    "estimatedRevenue" REAL,
    "productCount" INTEGER,
    "topCategories" TEXT,
    "lastScrapedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "AuCompetitorStore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuCompetitorProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "asin" TEXT NOT NULL,
    "title" TEXT,
    "price" REAL,
    "rating" REAL,
    "reviews" INTEGER,
    "bsr" INTEGER,
    "category" TEXT,
    "monthlySales" INTEGER,
    "monthlyRevenue" REAL,
    "imageUrl" TEXT,
    "sellerNation" TEXT,
    "fulfillment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AuCompetitorProduct_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "AuCompetitorStore" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuCategoryOpportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryName" TEXT NOT NULL,
    "nodeIdPath" TEXT,
    "marketSize" REAL,
    "avgPrice" REAL,
    "competitorCount" INTEGER,
    "cnSellerShare" REAL,
    "avgReviews" INTEGER,
    "entryDifficulty" TEXT,
    "profitMargin" REAL,
    "score" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'research',
    "notes" TEXT,
    "sourceStoreId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "AuCategoryOpportunity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuStorePlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeName" TEXT NOT NULL,
    "brandName" TEXT,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "targetMonthlyRevenue" REAL,
    "actualMonthlyRevenue" REAL,
    "skuCount" INTEGER NOT NULL DEFAULT 0,
    "launchDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "AuStorePlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuMilestone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storePlanId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetDate" DATETIME,
    "completedDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "AuMilestone_storePlanId_fkey" FOREIGN KEY ("storePlanId") REFERENCES "AuStorePlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuMilestone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

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
CREATE UNIQUE INDEX "AnalysisCache_cacheKey_key" ON "AnalysisCache"("cacheKey");

-- CreateIndex
CREATE INDEX "AnalysisCache_asin_idx" ON "AnalysisCache"("asin");

-- CreateIndex
CREATE INDEX "AnalysisCache_marketplace_idx" ON "AnalysisCache"("marketplace");

-- CreateIndex
CREATE INDEX "AnalysisCache_expiresAt_idx" ON "AnalysisCache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Supplier_status_idx" ON "Supplier"("status");

-- CreateIndex
CREATE INDEX "EmailAccount_userId_isActive_idx" ON "EmailAccount"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "EmailAccount_userId_email_key" ON "EmailAccount"("userId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Email_messageId_key" ON "Email"("messageId");

-- CreateIndex
CREATE INDEX "Email_accountId_receivedAt_idx" ON "Email"("accountId", "receivedAt");

-- CreateIndex
CREATE INDEX "Email_supplierId_receivedAt_idx" ON "Email"("supplierId", "receivedAt");

-- CreateIndex
CREATE INDEX "Email_supplierId_isRead_idx" ON "Email"("supplierId", "isRead");

-- CreateIndex
CREATE INDEX "Email_receivedAt_idx" ON "Email"("receivedAt");

-- CreateIndex
CREATE INDEX "Email_isDeleted_receivedAt_idx" ON "Email"("isDeleted", "receivedAt");

-- CreateIndex
CREATE INDEX "ActionItem_supplierId_isCompleted_idx" ON "ActionItem"("supplierId", "isCompleted");

-- CreateIndex
CREATE INDEX "ActionItem_isCompleted_priority_idx" ON "ActionItem"("isCompleted", "priority");

-- CreateIndex
CREATE INDEX "ActionItem_isCompleted_idx" ON "ActionItem"("isCompleted");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierDomain_domain_key" ON "SupplierDomain"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "ImapSyncState_emailAccount_key" ON "ImapSyncState"("emailAccount");

-- CreateIndex
CREATE UNIQUE INDEX "ImapSyncState_accountId_key" ON "ImapSyncState"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierFileAnalysis_fileId_key" ON "SupplierFileAnalysis"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_asin_key" ON "Product"("asin");

-- CreateIndex
CREATE UNIQUE INDEX "InviteCode_code_key" ON "InviteCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- CreateIndex
CREATE INDEX "ProductDev_status_idx" ON "ProductDev"("status");

-- CreateIndex
CREATE INDEX "ProductDev_priority_idx" ON "ProductDev"("priority");

-- CreateIndex
CREATE INDEX "ProductDev_createdBy_idx" ON "ProductDev"("createdBy");

-- CreateIndex
CREATE INDEX "ProductDevTask_productId_sortOrder_idx" ON "ProductDevTask"("productId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductDevLog_productId_createdAt_idx" ON "ProductDevLog"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductAnalysis_createdById_createdAt_idx" ON "ProductAnalysis"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "ProductAnalysis_supplierId_createdAt_idx" ON "ProductAnalysis"("supplierId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalysisChat_analysisId_createdAt_idx" ON "AnalysisChat"("analysisId", "createdAt");

-- CreateIndex
CREATE INDEX "BeautyTrend_market_createdAt_idx" ON "BeautyTrend"("market", "createdAt");

-- CreateIndex
CREATE INDEX "BeautyTrend_category_createdAt_idx" ON "BeautyTrend"("category", "createdAt");

-- CreateIndex
CREATE INDEX "ProductIdea_totalScore_idx" ON "ProductIdea"("totalScore");

-- CreateIndex
CREATE INDEX "ProductIdea_status_createdAt_idx" ON "ProductIdea"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductIdea_createdBy_createdAt_idx" ON "ProductIdea"("createdBy", "createdAt");

-- CreateIndex
CREATE INDEX "IdeaComment_ideaId_createdAt_idx" ON "IdeaComment"("ideaId", "createdAt");

-- CreateIndex
CREATE INDEX "TopPickReport_reportDate_idx" ON "TopPickReport"("reportDate");

-- CreateIndex
CREATE INDEX "TopPickReport_createdBy_idx" ON "TopPickReport"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "DailyBeautyReport_reportDate_key" ON "DailyBeautyReport"("reportDate");

-- CreateIndex
CREATE INDEX "ThreeCTrend_market_createdAt_idx" ON "ThreeCTrend"("market", "createdAt");

-- CreateIndex
CREATE INDEX "ThreeCTrend_category_createdAt_idx" ON "ThreeCTrend"("category", "createdAt");

-- CreateIndex
CREATE INDEX "ThreeCProductIdea_totalScore_idx" ON "ThreeCProductIdea"("totalScore");

-- CreateIndex
CREATE INDEX "ThreeCProductIdea_status_createdAt_idx" ON "ThreeCProductIdea"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ThreeCProductIdea_createdBy_createdAt_idx" ON "ThreeCProductIdea"("createdBy", "createdAt");

-- CreateIndex
CREATE INDEX "IdeaComment3C_ideaId_createdAt_idx" ON "IdeaComment3C"("ideaId", "createdAt");

-- CreateIndex
CREATE INDEX "ThreeCTopPickReport_reportDate_idx" ON "ThreeCTopPickReport"("reportDate");

-- CreateIndex
CREATE INDEX "ThreeCTopPickReport_createdBy_idx" ON "ThreeCTopPickReport"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "DailyThreeCReport_reportDate_key" ON "DailyThreeCReport"("reportDate");

-- CreateIndex
CREATE INDEX "EuropeTrend_market_createdAt_idx" ON "EuropeTrend"("market", "createdAt");

-- CreateIndex
CREATE INDEX "EuropeTrend_category_createdAt_idx" ON "EuropeTrend"("category", "createdAt");

-- CreateIndex
CREATE INDEX "EuropeProductIdea_totalScore_idx" ON "EuropeProductIdea"("totalScore");

-- CreateIndex
CREATE INDEX "EuropeProductIdea_status_createdAt_idx" ON "EuropeProductIdea"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EuropeProductIdea_createdBy_createdAt_idx" ON "EuropeProductIdea"("createdBy", "createdAt");

-- CreateIndex
CREATE INDEX "IdeaCommentEurope_ideaId_createdAt_idx" ON "IdeaCommentEurope"("ideaId", "createdAt");

-- CreateIndex
CREATE INDEX "EuropeTopPickReport_reportDate_idx" ON "EuropeTopPickReport"("reportDate");

-- CreateIndex
CREATE INDEX "EuropeTopPickReport_createdBy_idx" ON "EuropeTopPickReport"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "DailyEuropeReport_reportDate_key" ON "DailyEuropeReport"("reportDate");
