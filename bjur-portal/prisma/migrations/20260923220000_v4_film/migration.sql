-- v4: Film projects.
--
-- Four hand-written transforms, because the generated diff would have quietly dropped
-- all of them:
--
--   Project.type     <- review = 1 ? FILM : type.  Review stops being a flag any project
--                       can carry and becomes a type. Without this the two projects that
--                       had it would land on DELIVERY and lose their review loop entirely.
--   Reviewer (seats) <- ClientMember, for every FILM project. A converted project with no
--                       Reviewer rows is a review screen nobody can open, so the people
--                       who could already review have to be carried across explicitly.
--   ReviewNote       <- Review.feedback, before that column disappears. One note, no
--                       timestamp (it was written against a whole cut, not a moment).
--   Review.sentAt    <- createdAt for every existing row. The old model emailed the
--                       client the instant a cut appeared, so every cut that exists today
--                       has already gone out; leaving sentAt null would show them all as
--                       unreleased and ask the studio to send them a second time.
--
-- Order is forced: Project must be rebuilt before seats can be found by type, seats must
-- exist before notes can reference them, and notes must be copied before Review is
-- rebuilt without the feedback column.

-- CreateTable
CREATE TABLE "Reviewer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "token" TEXT,
    "lastOpenedAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reviewer_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reviewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "timeSec" REAL,
    "body" TEXT NOT NULL,
    "sentAt" DATETIME,
    "outcome" TEXT,
    "response" TEXT,
    "answeredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReviewNote_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewNote_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Reviewer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "type" TEXT NOT NULL DEFAULT 'DELIVERY',
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
INSERT INTO "new_Project" ("clientId", "createdAt", "deliveredAt", "deliveryNotifiedAt", "deliveryPendingAt", "deliveryPendingSince", "expiresAt", "expiryReminderSentFor", "id", "inboxSlug", "path", "paymentHold", "paymentReleasedAt", "status", "title", "type")
SELECT "clientId", "createdAt", "deliveredAt", "deliveryNotifiedAt", "deliveryPendingAt", "deliveryPendingSince", "expiresAt", "expiryReminderSentFor", "id", "inboxSlug", "path", "paymentHold", "paymentReleasedAt", "status", "title",
       CASE WHEN "review" = 1 THEN 'FILM' ELSE "type" END
FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_inboxSlug_key" ON "Project"("inboxSlug");
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- Seats: every active member of the client reviews a Film project, whatever their role.
-- A viewer who cannot download still has notes worth hearing.
INSERT INTO "Reviewer" ("id", "projectId", "kind", "userId", "email", "name", "role", "createdAt")
SELECT lower(hex(randomblob(16))), p."id", 'SEAT', u."id", u."email", u."name", NULL, CURRENT_TIMESTAMP
FROM "Project" p
JOIN "ClientMember" m ON m."clientId" = p."clientId"
JOIN "User" u ON u."id" = m."userId"
WHERE p."type" = 'FILM' AND u."deactivatedAt" IS NULL;

-- Anyone who left notes but is no longer a member of the client still has to own them,
-- or the note below would have no author and be dropped on the floor.
INSERT INTO "Reviewer" ("id", "projectId", "kind", "userId", "email", "name", "role", "revokedAt", "createdAt")
SELECT DISTINCT lower(hex(randomblob(16))), a."projectId", 'SEAT', u."id", u."email", u."name", NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Review" r
JOIN "Asset" a ON a."id" = r."assetId"
JOIN "User" u ON u."id" = r."userId"
WHERE r."userId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Reviewer" rv WHERE rv."projectId" = a."projectId" AND rv."userId" = u."id");

-- The old free-text feedback becomes one general note per cut: no timeSec, because it was
-- written against the whole cut rather than a moment in it.
INSERT INTO "ReviewNote" ("id", "reviewId", "reviewerId", "timeSec", "body", "sentAt", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), r."id", rv."id", NULL, r."feedback",
       COALESCE(r."respondedAt", r."createdAt"), r."createdAt", CURRENT_TIMESTAMP
FROM "Review" r
JOIN "Asset" a ON a."id" = r."assetId"
JOIN "Reviewer" rv ON rv."projectId" = a."projectId" AND rv."userId" = r."userId"
WHERE r."feedback" IS NOT NULL AND trim(r."feedback") <> '';

CREATE TABLE "new_Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" DATETIME,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "supersededAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Review_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Reviewer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Review" ("assetId", "createdAt", "id", "note", "version", "state", "sentAt")
SELECT "assetId", "createdAt", "id", "note", "version",
       -- FEEDBACK is gone. A cut that had notes against it is simply still pending: the
       -- studio owes it an answer, which is what PENDING means now.
       CASE WHEN "state" = 'FEEDBACK' THEN 'PENDING' ELSE "state" END,
       "createdAt"
FROM "Review";
DROP TABLE "Review";
ALTER TABLE "new_Review" RENAME TO "Review";
CREATE INDEX "Review_assetId_idx" ON "Review"("assetId");
CREATE INDEX "Review_state_idx" ON "Review"("state");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Reviewer_token_key" ON "Reviewer"("token");
CREATE INDEX "Reviewer_projectId_idx" ON "Reviewer"("projectId");
CREATE UNIQUE INDEX "Reviewer_projectId_email_key" ON "Reviewer"("projectId", "email");
CREATE INDEX "ReviewNote_reviewId_idx" ON "ReviewNote"("reviewId");
CREATE INDEX "ReviewNote_reviewerId_idx" ON "ReviewNote"("reviewerId");
