-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ClientChannel" (
    "clientId" TEXT NOT NULL PRIMARY KEY,
    "channel" TEXT NOT NULL,
    "autoPostSlack" BOOLEAN NOT NULL DEFAULT false,
    "autoPostDay" INTEGER NOT NULL DEFAULT 0,
    "autoPostHour" INTEGER NOT NULL DEFAULT 21,
    "lastPostedAt" DATETIME,
    CONSTRAINT "ClientChannel_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ClientChannel" ("channel", "clientId") SELECT "channel", "clientId" FROM "ClientChannel";
DROP TABLE "ClientChannel";
ALTER TABLE "new_ClientChannel" RENAME TO "ClientChannel";
CREATE TABLE "new_SlackConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "workspace" TEXT,
    "webhookUrl" TEXT,
    "defaultChannel" TEXT NOT NULL DEFAULT '#client-deliveries',
    "weeklyDay" TEXT NOT NULL DEFAULT 'Monday',
    "weeklyTime" TEXT NOT NULL DEFAULT '09:00',
    "autoWeekly" BOOLEAN NOT NULL DEFAULT true,
    "autoContentCalendar" BOOLEAN NOT NULL DEFAULT true,
    "autoUpload" BOOLEAN NOT NULL DEFAULT true,
    "autoDownload" BOOLEAN NOT NULL DEFAULT false,
    "autoLicense" BOOLEAN NOT NULL DEFAULT true,
    "autoSubmission" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_SlackConfig" ("autoDownload", "autoLicense", "autoSubmission", "autoUpload", "autoWeekly", "connected", "defaultChannel", "id", "webhookUrl", "weeklyDay", "weeklyTime", "workspace") SELECT "autoDownload", "autoLicense", "autoSubmission", "autoUpload", "autoWeekly", "connected", "defaultChannel", "id", "webhookUrl", "weeklyDay", "weeklyTime", "workspace" FROM "SlackConfig";
DROP TABLE "SlackConfig";
ALTER TABLE "new_SlackConfig" RENAME TO "SlackConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
