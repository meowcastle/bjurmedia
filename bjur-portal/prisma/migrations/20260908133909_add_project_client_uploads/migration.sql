-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "inboxSlug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LIVE',
    "clientUploads" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" DATETIME,
    "expiresAt" DATETIME,
    "deliveryPendingSince" DATETIME,
    "deliveryPendingAt" DATETIME,
    "deliveryNotifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryReminderSentFor" INTEGER,
    CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("clientId", "createdAt", "deliveredAt", "deliveryNotifiedAt", "deliveryPendingAt", "deliveryPendingSince", "expiresAt", "expiryReminderSentFor", "id", "inboxSlug", "path", "status", "title") SELECT "clientId", "createdAt", "deliveredAt", "deliveryNotifiedAt", "deliveryPendingAt", "deliveryPendingSince", "expiresAt", "expiryReminderSentFor", "id", "inboxSlug", "path", "status", "title" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_inboxSlug_key" ON "Project"("inboxSlug");
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Preserve what is already in use. The column defaults to false because this is now an
-- opt-in capability, but a project a client has already uploaded to is one where the
-- capability was clearly intended — switching it off under them would break a live
-- workflow to enforce a policy that did not exist when they started.
UPDATE "Project" SET "clientUploads" = true
WHERE "id" IN (SELECT DISTINCT "projectId" FROM "Submission")
   OR "id" IN (SELECT DISTINCT "projectId" FROM "UploadBatch");
