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
    "markStatus" TEXT NOT NULL DEFAULT 'NONE',
    "markedThumbRelPath" TEXT,
    "markedProxyRelPath" TEXT,
    "markedFileRelPath" TEXT,
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
    "captionApprovedAt" DATETIME,
    "postedToSlackAt" DATETIME,
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
INSERT INTO "new_Asset" ("approvalDueAt", "approvalRemindedAt", "approvedAt", "approvedById", "basePrice", "caption", "captionApprovedAt", "captionSource", "captionYT", "collaborators", "contentTitle", "createdAt", "dims", "durationSec", "folderId", "format", "heldAt", "id", "igMediaId", "internal", "kind", "lastReplacedAt", "licensable", "masterCodec", "name", "orientation", "postedToSlackAt", "projectId", "proxyRelPath", "proxyRes", "proxyStatus", "publishAt", "publishAttempts", "publishError", "publishIg", "publishState", "publishYt", "reingestCount", "relPath", "sizeBytes", "thumbRelPath", "transcribedAt", "transcript", "transcriptError", "transcriptStatus", "updatedAt", "weekOf", "ytVideoId") SELECT "approvalDueAt", "approvalRemindedAt", "approvedAt", "approvedById", "basePrice", "caption", "captionApprovedAt", "captionSource", "captionYT", "collaborators", "contentTitle", "createdAt", "dims", "durationSec", "folderId", "format", "heldAt", "id", "igMediaId", "internal", "kind", "lastReplacedAt", "licensable", "masterCodec", "name", "orientation", "postedToSlackAt", "projectId", "proxyRelPath", "proxyRes", "proxyStatus", "publishAt", "publishAttempts", "publishError", "publishIg", "publishState", "publishYt", "reingestCount", "relPath", "sizeBytes", "thumbRelPath", "transcribedAt", "transcript", "transcriptError", "transcriptStatus", "updatedAt", "weekOf", "ytVideoId" FROM "Asset";
DROP TABLE "Asset";
ALTER TABLE "new_Asset" RENAME TO "Asset";
CREATE INDEX "Asset_projectId_idx" ON "Asset"("projectId");
CREATE INDEX "Asset_folderId_idx" ON "Asset"("folderId");
CREATE INDEX "Asset_publishState_publishAt_idx" ON "Asset"("publishState", "publishAt");
CREATE INDEX "Asset_transcriptStatus_idx" ON "Asset"("transcriptStatus");
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "inboxSlug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LIVE',
    "clientUploads" BOOLEAN NOT NULL DEFAULT false,
    "calendar" BOOLEAN NOT NULL DEFAULT false,
    "review" BOOLEAN NOT NULL DEFAULT false,
    "sellMasters" BOOLEAN NOT NULL DEFAULT false,
    "paymentHold" BOOLEAN NOT NULL DEFAULT false,
    "paymentReleasedAt" DATETIME,
    "deliveredAt" DATETIME,
    "expiresAt" DATETIME,
    "deliveryPendingSince" DATETIME,
    "deliveryPendingAt" DATETIME,
    "deliveryNotifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryReminderSentFor" INTEGER,
    CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("calendar", "clientId", "clientUploads", "createdAt", "deliveredAt", "deliveryNotifiedAt", "deliveryPendingAt", "deliveryPendingSince", "expiresAt", "expiryReminderSentFor", "id", "inboxSlug", "path", "review", "sellMasters", "status", "title") SELECT "calendar", "clientId", "clientUploads", "createdAt", "deliveredAt", "deliveryNotifiedAt", "deliveryPendingAt", "deliveryPendingSince", "expiresAt", "expiryReminderSentFor", "id", "inboxSlug", "path", "review", "sellMasters", "status", "title" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_inboxSlug_key" ON "Project"("inboxSlug");
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
