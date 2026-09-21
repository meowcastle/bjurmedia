-- v3 project shape.
--
-- Two data transforms are hand-written into the table rebuilds below, because dropping
-- these columns without them would change what clients can reach:
--
--   Asset.internal   <- internal OR licensable.  Licensing is gone; a master that was
--                       sold rather than delivered must stay hidden, not become a free
--                       download the moment the paywall column disappears.
--   Project.type     <- calendar ? CALENDAR : DELIVERY.  Without this every existing
--                       project would silently take the DELIVERY default and the social
--                       calendars would lose their board.

-- DropIndex
DROP INDEX "License_assetId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "License";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "SubmissionRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubmissionRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "captionApprovedAt" DATETIME,
    "postedToSlackAt" DATETIME,
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
INSERT INTO "new_Asset" ("approvedAt", "approvedById", "caption", "captionApprovedAt", "captionSource", "captionYT", "collaborators", "contentTitle", "createdAt", "dims", "durationSec", "folderId", "format", "id", "igMediaId", "internal", "kind", "lastReplacedAt", "markStatus", "markedFileRelPath", "markedProxyRelPath", "markedThumbRelPath", "masterCodec", "name", "orientation", "postedToSlackAt", "projectId", "proxyRelPath", "proxyRes", "proxyStatus", "publishAt", "publishAttempts", "publishError", "publishIg", "publishState", "publishYt", "reingestCount", "relPath", "sizeBytes", "thumbRelPath", "transcribedAt", "transcript", "transcriptError", "transcriptStatus", "updatedAt", "weekOf", "ytVideoId") SELECT "approvedAt", "approvedById", "caption", "captionApprovedAt", "captionSource", "captionYT", "collaborators", "contentTitle", "createdAt", "dims", "durationSec", "folderId", "format", "id", "igMediaId", CASE WHEN "licensable" = 1 THEN 1 ELSE "internal" END, "kind", "lastReplacedAt", "markStatus", "markedFileRelPath", "markedProxyRelPath", "markedThumbRelPath", "masterCodec", "name", "orientation", "postedToSlackAt", "projectId", "proxyRelPath", "proxyRes", "proxyStatus", "publishAt", "publishAttempts", "publishError", "publishIg", "publishState", "publishYt", "reingestCount", "relPath", "sizeBytes", "thumbRelPath", "transcribedAt", "transcript", "transcriptError", "transcriptStatus", "updatedAt", "weekOf", "ytVideoId" FROM "Asset";
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
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "accentColor" TEXT,
    "logoUrl" TEXT,
    "autoCaption" BOOLEAN NOT NULL DEFAULT false,
    "captionStyle" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Client" ("accentColor", "autoCaption", "captionStyle", "createdAt", "id", "logoUrl", "name", "status", "username") SELECT "accentColor", "autoCaption", "captionStyle", "createdAt", "id", "logoUrl", "name", "status", "username" FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
CREATE UNIQUE INDEX "Client_username_key" ON "Client"("username");
CREATE TABLE "new_ClientChannel" (
    "clientId" TEXT NOT NULL PRIMARY KEY,
    "channel" TEXT NOT NULL,
    CONSTRAINT "ClientChannel_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ClientChannel" ("channel", "clientId") SELECT "channel", "clientId" FROM "ClientChannel";
DROP TABLE "ClientChannel";
ALTER TABLE "new_ClientChannel" RENAME TO "ClientChannel";
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "inboxSlug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LIVE',
    "type" TEXT NOT NULL DEFAULT 'DELIVERY',
    "review" BOOLEAN NOT NULL DEFAULT false,
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
INSERT INTO "new_Project" ("clientId", "createdAt", "deliveredAt", "deliveryNotifiedAt", "deliveryPendingAt", "deliveryPendingSince", "expiresAt", "expiryReminderSentFor", "id", "inboxSlug", "path", "paymentHold", "paymentReleasedAt", "review", "status", "title", "type") SELECT "clientId", "createdAt", "deliveredAt", "deliveryNotifiedAt", "deliveryPendingAt", "deliveryPendingSince", "expiresAt", "expiryReminderSentFor", "id", "inboxSlug", "path", "paymentHold", "paymentReleasedAt", "review", "status", "title", CASE WHEN "calendar" = 1 THEN 'CALENDAR' ELSE 'DELIVERY' END FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_inboxSlug_key" ON "Project"("inboxSlug");
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");
CREATE TABLE "new_SlackConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "workspace" TEXT,
    "webhookUrl" TEXT,
    "defaultChannel" TEXT NOT NULL DEFAULT '#client-deliveries',
    "autoUpload" BOOLEAN NOT NULL DEFAULT true,
    "autoDownload" BOOLEAN NOT NULL DEFAULT false,
    "autoSubmission" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_SlackConfig" ("autoDownload", "autoSubmission", "autoUpload", "connected", "defaultChannel", "id", "webhookUrl", "workspace") SELECT "autoDownload", "autoSubmission", "autoUpload", "connected", "defaultChannel", "id", "webhookUrl", "workspace" FROM "SlackConfig";
DROP TABLE "SlackConfig";
ALTER TABLE "new_SlackConfig" RENAME TO "SlackConfig";
CREATE TABLE "new_SocialConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "youtubeApiKey" TEXT
);
INSERT INTO "new_SocialConfig" ("id", "youtubeApiKey") SELECT "id", "youtubeApiKey" FROM "SocialConfig";
DROP TABLE "SocialConfig";
ALTER TABLE "new_SocialConfig" RENAME TO "SocialConfig";
CREATE TABLE "new_UploadBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "requestId" TEXT,
    "senderName" TEXT,
    "label" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UploadBatch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UploadBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "UploadBatch_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SubmissionRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_UploadBatch" ("createdAt", "id", "label", "projectId", "userId") SELECT "createdAt", "id", "label", "projectId", "userId" FROM "UploadBatch";
DROP TABLE "UploadBatch";
ALTER TABLE "new_UploadBatch" RENAME TO "UploadBatch";
CREATE INDEX "UploadBatch_projectId_idx" ON "UploadBatch"("projectId");
CREATE INDEX "UploadBatch_requestId_idx" ON "UploadBatch"("requestId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionRequest_token_key" ON "SubmissionRequest"("token");

-- CreateIndex
CREATE INDEX "SubmissionRequest_projectId_idx" ON "SubmissionRequest"("projectId");

