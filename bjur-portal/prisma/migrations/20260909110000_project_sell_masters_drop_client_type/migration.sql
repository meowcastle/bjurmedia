-- Replaces Client.type (RETAINER / ONEOFF) with a per-project "sell masters" switch.
--
-- Order matters. Project is rebuilt FIRST so sellMasters exists, then backfilled from
-- Client.type while that column is still there, and only then is Client rebuilt without
-- it. Prisma's own diff emits Client first, which would drop the column this backfill
-- reads and silently leave every project with sellMasters = false — i.e. quietly stop
-- offering masters to every one-off client the studio has.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- 1. Project gains sellMasters.
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
    "deliveredAt" DATETIME,
    "expiresAt" DATETIME,
    "deliveryPendingSince" DATETIME,
    "deliveryPendingAt" DATETIME,
    "deliveryNotifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryReminderSentFor" INTEGER,
    CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("calendar", "clientId", "clientUploads", "createdAt", "deliveredAt", "deliveryNotifiedAt", "deliveryPendingAt", "deliveryPendingSince", "expiresAt", "expiryReminderSentFor", "id", "inboxSlug", "path", "review", "status", "title") SELECT "calendar", "clientId", "clientUploads", "createdAt", "deliveredAt", "deliveryNotifiedAt", "deliveryPendingAt", "deliveryPendingSince", "expiresAt", "expiryReminderSentFor", "id", "inboxSlug", "path", "review", "status", "title" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_inboxSlug_key" ON "Project"("inboxSlug");
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- 2. Preserve today's behaviour: a one-off client's masters were licensable, so every
--    project of theirs keeps selling them. Retainers stay internal, which is the default.
UPDATE "Project"
   SET "sellMasters" = true
 WHERE "clientId" IN (SELECT "id" FROM "Client" WHERE "type" = 'ONEOFF');

-- 3. Now Client can lose the column.
CREATE TABLE "new_Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "accentColor" TEXT,
    "logoUrl" TEXT,
    "autoCaption" BOOLEAN NOT NULL DEFAULT false,
    "captionStyle" TEXT,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
    "approvalAutoHours" INTEGER NOT NULL DEFAULT 24,
    "notifyWeekly" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Client" ("accentColor", "approvalAutoHours", "approvalRequired", "autoCaption", "captionStyle", "createdAt", "id", "logoUrl", "name", "notifyWeekly", "status", "username") SELECT "accentColor", "approvalAutoHours", "approvalRequired", "autoCaption", "captionStyle", "createdAt", "id", "logoUrl", "name", "notifyWeekly", "status", "username" FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
CREATE UNIQUE INDEX "Client_username_key" ON "Client"("username");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
