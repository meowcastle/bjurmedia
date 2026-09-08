-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "orientation" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relPath" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "dims" TEXT,
    "durationSec" INTEGER,
    "masterCodec" TEXT,
    "proxyStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "proxyRelPath" TEXT,
    "thumbRelPath" TEXT,
    "proxyRes" TEXT,
    "reingestCount" INTEGER NOT NULL DEFAULT 0,
    "lastReplacedAt" DATETIME,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "licensable" BOOLEAN NOT NULL DEFAULT false,
    "basePrice" INTEGER,
    "weekOf" DATETIME,
    "folderId" TEXT,
    "contentTitle" TEXT,
    "caption" TEXT,
    "captionYT" TEXT,
    "transcript" TEXT,
    "transcriptStatus" TEXT NOT NULL DEFAULT 'NONE',
    "transcriptError" TEXT,
    "transcribedAt" DATETIME,
    "captionSource" TEXT NOT NULL DEFAULT 'HUMAN',
    "publishAt" DATETIME,
    "publishIg" BOOLEAN NOT NULL DEFAULT false,
    "publishYt" BOOLEAN NOT NULL DEFAULT false,
    "collaborators" TEXT,
    "publishState" TEXT NOT NULL DEFAULT 'NONE',
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "heldAt" DATETIME,
    "approvalDueAt" DATETIME,
    "approvalRemindedAt" DATETIME,
    "publishAttempts" INTEGER NOT NULL DEFAULT 0,
    "publishError" TEXT,
    "igMediaId" TEXT,
    "ytVideoId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Asset_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Asset_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Asset" ("approvalDueAt", "approvalRemindedAt", "approvedAt", "approvedById", "basePrice", "caption", "captionYT", "collaborators", "contentTitle", "createdAt", "dims", "durationSec", "folderId", "format", "heldAt", "id", "igMediaId", "internal", "kind", "lastReplacedAt", "licensable", "masterCodec", "name", "orientation", "projectId", "proxyRelPath", "proxyRes", "proxyStatus", "publishAt", "publishAttempts", "publishError", "publishIg", "publishState", "publishYt", "reingestCount", "relPath", "sizeBytes", "thumbRelPath", "updatedAt", "weekOf", "ytVideoId") SELECT "approvalDueAt", "approvalRemindedAt", "approvedAt", "approvedById", "basePrice", "caption", "captionYT", "collaborators", "contentTitle", "createdAt", "dims", "durationSec", "folderId", "format", "heldAt", "id", "igMediaId", "internal", "kind", "lastReplacedAt", "licensable", "masterCodec", "name", "orientation", "projectId", "proxyRelPath", "proxyRes", "proxyStatus", "publishAt", "publishAttempts", "publishError", "publishIg", "publishState", "publishYt", "reingestCount", "relPath", "sizeBytes", "thumbRelPath", "updatedAt", "weekOf", "ytVideoId" FROM "Asset";
DROP TABLE "Asset";
ALTER TABLE "new_Asset" RENAME TO "Asset";
CREATE INDEX "Asset_projectId_idx" ON "Asset"("projectId");
CREATE INDEX "Asset_folderId_idx" ON "Asset"("folderId");
CREATE INDEX "Asset_publishState_publishAt_idx" ON "Asset"("publishState", "publishAt");
CREATE INDEX "Asset_transcriptStatus_idx" ON "Asset"("transcriptStatus");
CREATE TABLE "new_Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'RETAINER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "accentColor" TEXT,
    "logoUrl" TEXT,
    "autoCaption" BOOLEAN NOT NULL DEFAULT false,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
    "approvalAutoHours" INTEGER NOT NULL DEFAULT 24,
    "notifyWeekly" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Client" ("accentColor", "approvalAutoHours", "approvalRequired", "createdAt", "id", "logoUrl", "name", "notifyWeekly", "status", "type", "username") SELECT "accentColor", "approvalAutoHours", "approvalRequired", "createdAt", "id", "logoUrl", "name", "notifyWeekly", "status", "type", "username" FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
CREATE UNIQUE INDEX "Client_username_key" ON "Client"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
