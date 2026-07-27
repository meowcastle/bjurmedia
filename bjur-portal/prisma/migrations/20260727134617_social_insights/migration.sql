-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "accessToken" TEXT,
    "lastSyncedAt" DATETIME,
    "lastSyncError" TEXT,
    CONSTRAINT "SocialAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "socialAccountId" TEXT NOT NULL,
    "assetId" TEXT,
    "externalPostId" TEXT NOT NULL,
    "permalink" TEXT,
    "caption" TEXT,
    "postedAt" DATETIME NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "matchConfidence" TEXT,
    "lastFetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialPost_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialPost_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SocialConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "youtubeApiKey" TEXT,
    "weeklyDay" TEXT NOT NULL DEFAULT 'Tuesday',
    "weeklyTime" TEXT NOT NULL DEFAULT '09:00',
    "autoWeekly" BOOLEAN NOT NULL DEFAULT true
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_clientId_platform_key" ON "SocialAccount"("clientId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "SocialPost_externalPostId_key" ON "SocialPost"("externalPostId");

-- CreateIndex
CREATE INDEX "SocialPost_assetId_idx" ON "SocialPost"("assetId");

-- CreateIndex
CREATE INDEX "SocialPost_socialAccountId_idx" ON "SocialPost"("socialAccountId");
