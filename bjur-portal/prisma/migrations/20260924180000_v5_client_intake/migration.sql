-- v5: submissions belong to the client, not a project.
--
-- Footage arrives for weeks before anyone knows what it will be cut into, and tying
-- intake to a project meant one project held a fortnight of rushes *and* was supposed to
-- be the thing a client opened for feedback. Those could not be retired separately: the
-- delete guard correctly refused, because the project held the only copy of 302 GB
-- somebody else had sent.
--
-- Two hand-written transforms, because the generated diff drops both silently:
--
--   clientId  <- the current project's clientId, on all three tables. Without it the
--                column lands NOT NULL and empty, which is 301 submissions pointing at
--                nobody — every row of Xavier's fortnight.
--   name      <- label, which already carries something a person wrote ("2026-09-21 -
--                Xavier"). The spec says backfill from the request name or "Untitled";
--                using the label first keeps the sixteen batches already on disk
--                recognisable instead of renaming them all to Untitled.
--
-- Verified against a copy of the live database: 301 submissions, 16 batches, 1 request,
-- no orphans.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Submission -------------------------------------------------------------------------
CREATE TABLE "new_Submission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
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
    CONSTRAINT "Submission_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Submission_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "UploadBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Submission" ("id","clientId","userId","batchId","relativePath","filename","relPath","sizeBytes","receivedBytes","status","createdAt","updatedAt","completedAt")
SELECT s."id",
       (SELECT p."clientId" FROM "Project" p WHERE p."id" = s."projectId"),
       s."userId", s."batchId", s."relativePath", s."filename", s."relPath",
       s."sizeBytes", s."receivedBytes", s."status", s."createdAt", s."updatedAt", s."completedAt"
FROM "Submission" s
WHERE EXISTS (SELECT 1 FROM "Project" p WHERE p."id" = s."projectId");
DROP TABLE "Submission";
ALTER TABLE "new_Submission" RENAME TO "Submission";
CREATE INDEX "Submission_clientId_idx" ON "Submission"("clientId");
CREATE INDEX "Submission_userId_idx" ON "Submission"("userId");
CREATE INDEX "Submission_batchId_idx" ON "Submission"("batchId");

-- SubmissionRequest ------------------------------------------------------------------
CREATE TABLE "new_SubmissionRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubmissionRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SubmissionRequest" ("id","clientId","name","token","expiresAt","closedAt","createdAt")
SELECT r."id",
       (SELECT p."clientId" FROM "Project" p WHERE p."id" = r."projectId"),
       r."name", r."token", r."expiresAt", r."closedAt", r."createdAt"
FROM "SubmissionRequest" r
WHERE EXISTS (SELECT 1 FROM "Project" p WHERE p."id" = r."projectId");
DROP TABLE "SubmissionRequest";
ALTER TABLE "new_SubmissionRequest" RENAME TO "SubmissionRequest";
CREATE UNIQUE INDEX "SubmissionRequest_token_key" ON "SubmissionRequest"("token");
CREATE INDEX "SubmissionRequest_clientId_idx" ON "SubmissionRequest"("clientId");

-- UploadBatch ------------------------------------------------------------------------
CREATE TABLE "new_UploadBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "userId" TEXT,
    "requestId" TEXT,
    "senderName" TEXT,
    "name" TEXT NOT NULL,
    "filesDeletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UploadBatch_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UploadBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "UploadBatch_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SubmissionRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_UploadBatch" ("id","clientId","userId","requestId","senderName","name","createdAt")
SELECT b."id",
       (SELECT p."clientId" FROM "Project" p WHERE p."id" = b."projectId"),
       b."userId", b."requestId", b."senderName",
       COALESCE(
         NULLIF(TRIM(b."label"), ''),
         (SELECT NULLIF(TRIM(r."name"), '') FROM "SubmissionRequest" r WHERE r."id" = b."requestId"),
         'Untitled'
       ),
       b."createdAt"
FROM "UploadBatch" b
WHERE EXISTS (SELECT 1 FROM "Project" p WHERE p."id" = b."projectId");
DROP TABLE "UploadBatch";
ALTER TABLE "new_UploadBatch" RENAME TO "UploadBatch";
CREATE INDEX "UploadBatch_clientId_idx" ON "UploadBatch"("clientId");
CREATE INDEX "UploadBatch_requestId_idx" ON "UploadBatch"("requestId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
