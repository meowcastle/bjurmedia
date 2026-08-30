-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "relPath" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "receivedBytes" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'UPLOADING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "Submission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SlackConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "workspace" TEXT,
    "webhookUrl" TEXT,
    "defaultChannel" TEXT NOT NULL DEFAULT '#client-deliveries',
    "weeklyDay" TEXT NOT NULL DEFAULT 'Monday',
    "weeklyTime" TEXT NOT NULL DEFAULT '09:00',
    "autoWeekly" BOOLEAN NOT NULL DEFAULT true,
    "autoUpload" BOOLEAN NOT NULL DEFAULT true,
    "autoDownload" BOOLEAN NOT NULL DEFAULT false,
    "autoLicense" BOOLEAN NOT NULL DEFAULT true,
    "autoSubmission" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_SlackConfig" ("autoDownload", "autoLicense", "autoUpload", "autoWeekly", "connected", "defaultChannel", "id", "webhookUrl", "weeklyDay", "weeklyTime", "workspace") SELECT "autoDownload", "autoLicense", "autoUpload", "autoWeekly", "connected", "defaultChannel", "id", "webhookUrl", "weeklyDay", "weeklyTime", "workspace" FROM "SlackConfig";
DROP TABLE "SlackConfig";
ALTER TABLE "new_SlackConfig" RENAME TO "SlackConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Submission_projectId_idx" ON "Submission"("projectId");

-- CreateIndex
CREATE INDEX "Submission_userId_idx" ON "Submission"("userId");
