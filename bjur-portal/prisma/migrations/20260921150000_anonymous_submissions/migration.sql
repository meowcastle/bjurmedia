-- Submissions sent through a public send link have no account behind them.
-- UploadBatch.userId went nullable in v3_project_shape; its rows did not.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Submission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "batchId" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "relPath" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "receivedBytes" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'UPLOADING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "Submission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Submission_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "UploadBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Submission" ("batchId", "completedAt", "createdAt", "filename", "id", "projectId", "receivedBytes", "relPath", "relativePath", "sizeBytes", "status", "updatedAt", "userId") SELECT "batchId", "completedAt", "createdAt", "filename", "id", "projectId", "receivedBytes", "relPath", "relativePath", "sizeBytes", "status", "updatedAt", "userId" FROM "Submission";
DROP TABLE "Submission";
ALTER TABLE "new_Submission" RENAME TO "Submission";
CREATE INDEX "Submission_projectId_idx" ON "Submission"("projectId");
CREATE INDEX "Submission_userId_idx" ON "Submission"("userId");
CREATE INDEX "Submission_batchId_idx" ON "Submission"("batchId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

