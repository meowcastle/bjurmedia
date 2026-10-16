-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "clientId" TEXT,
    "userId" TEXT,
    "source" TEXT,
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Contact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "contactId" TEXT,
    "clientId" TEXT,
    "projectId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'PROJECT',
    "stage" TEXT NOT NULL DEFAULT 'LEAD',
    "stageChangedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" INTEGER,
    "notes" TEXT,
    "lastNudgedAt" DATETIME,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Deal_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "dueAt" DATETIME,
    "dealId" TEXT,
    "contactId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'HUMAN',
    "doneAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Task_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "toEmail" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "context" JSONB,
    "dealId" TEXT,
    "contactId" TEXT,
    "clientId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    "sentAt" DATETIME,
    "dismissedAt" DATETIME,
    "error" TEXT,
    CONSTRAINT "AgentDraft_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AgentDraft_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "digestDay" TEXT NOT NULL DEFAULT 'Monday',
    "digestTime" TEXT NOT NULL DEFAULT '09:00',
    "digestSentAt" DATETIME,
    "quotedStallDays" INTEGER NOT NULL DEFAULT 5,
    "unpaidStallDays" INTEGER NOT NULL DEFAULT 7,
    "nextStepDays" INTEGER NOT NULL DEFAULT 14,
    "reviewStallDays" INTEGER NOT NULL DEFAULT 4,
    "autoSendKinds" JSONB NOT NULL DEFAULT '[]',
    "maxSendsPerDay" INTEGER NOT NULL DEFAULT 10
);

-- CreateIndex
CREATE UNIQUE INDEX "Contact_email_key" ON "Contact"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_userId_key" ON "Contact"("userId");

-- CreateIndex
CREATE INDEX "Contact_clientId_idx" ON "Contact"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_projectId_key" ON "Deal"("projectId");

-- CreateIndex
CREATE INDEX "Deal_stage_stageChangedAt_idx" ON "Deal"("stage", "stageChangedAt");

-- CreateIndex
CREATE INDEX "Deal_clientId_idx" ON "Deal"("clientId");

-- CreateIndex
CREATE INDEX "Task_dueAt_idx" ON "Task"("dueAt");

-- CreateIndex
CREATE INDEX "AgentDraft_state_createdAt_idx" ON "AgentDraft"("state", "createdAt");

-- ─── One-time backfill (CRM.md §2) ────────────────────────────────────────────────
-- Not a sync: after this the CRM tables are edited on their own.

-- The settings row every scheduler reads.
INSERT INTO "AgentConfig" ("id") VALUES (1);

-- Every project becomes a deal, staged from what the portal already knows about payment.
-- lastNudgedAt starts at deploy: the follow-up agent measures from now, not from history,
-- or day one would bring a "next step" draft for every project ever paid for.
INSERT INTO "Deal" ("id", "title", "clientId", "projectId", "kind", "stage", "stageChangedAt", "lastNudgedAt", "createdAt")
SELECT
  lower(hex(randomblob(12))),
  p."title",
  p."clientId",
  p."id",
  'PROJECT',
  CASE
    WHEN p."paymentHold" = 1 THEN 'DELIVERED'
    WHEN p."paymentReleasedAt" IS NOT NULL THEN 'PAID'
    ELSE 'ACTIVE'
  END,
  CASE
    WHEN p."paymentHold" = 1 THEN COALESCE(p."deliveredAt", p."createdAt")
    WHEN p."paymentReleasedAt" IS NOT NULL THEN p."paymentReleasedAt"
    ELSE p."createdAt"
  END,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  p."createdAt"
FROM "Project" p;

-- Every client login becomes a contact, attached to the first client they joined. Read
-- from ClientMember, the authority on who belongs to a client (User.clientId is stale).
INSERT INTO "Contact" ("id", "name", "email", "clientId", "userId", "source", "createdAt")
SELECT
  lower(hex(randomblob(12))),
  u."name",
  lower(u."email"),
  (SELECT cm."clientId" FROM "ClientMember" cm WHERE cm."userId" = u."id" ORDER BY cm."createdAt" LIMIT 1),
  u."id",
  'backfill',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM "User" u
WHERE u."isAdmin" = 0
  AND u."deactivatedAt" IS NULL
  AND EXISTS (SELECT 1 FROM "ClientMember" cm WHERE cm."userId" = u."id");
