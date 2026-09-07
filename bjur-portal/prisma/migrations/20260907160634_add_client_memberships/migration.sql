-- AlterTable
ALTER TABLE "Session" ADD COLUMN "activeClientId" TEXT;

-- CreateTable
CREATE TABLE "ClientMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientMember_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ClientMember_clientId_idx" ON "ClientMember"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientMember_userId_clientId_key" ON "ClientMember"("userId", "clientId");

-- Backfill every existing seat as a member of the client it already belonged to.
-- Without this the table is empty on deploy, memberships become the authority on
-- access, and every client user is locked out of their own portal.
INSERT INTO "ClientMember" ("id", "userId", "clientId", "role", "createdAt")
SELECT
  'cm_' || lower(hex(randomblob(12))),
  "id",
  "clientId",
  "role",
  CURRENT_TIMESTAMP
FROM "User"
WHERE "clientId" IS NOT NULL;
