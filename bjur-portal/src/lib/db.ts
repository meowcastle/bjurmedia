import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// The web and worker processes each hold their own independent connection to the
// same SQLite file. SQLite's default rollback-journal mode allows only one writer
// at a time and has no wait/retry behavior, so any concurrent write from the other
// process (or a burst of writes within one process) fails immediately instead of
// queuing. WAL mode lets readers and a writer proceed without blocking each other,
// and busy_timeout makes writers that do contend retry for a few seconds instead of
// erroring right away.
// Both of these PRAGMAs return the value they just set as a result row (e.g.
// journal_mode=WAL returns "wal"), so they need $queryRawUnsafe — $executeRawUnsafe
// is only for statements that return no rows, and throws "Execute returned results"
// for anything that does, silently failing to ever apply either setting.
//
// Skipped entirely under Playwright: the e2e run has no worker process and a single
// test worker, so WAL brings no benefit there, and flipping a fresh e2e.db into WAL
// mode for the first time right as Playwright's globalSetup separately runs
// `prisma migrate deploy` against that same file causes a real, consistently
// reproducible "database is locked" — the two connections stepping on each other
// during that one-time mode transition, not just a transient timing issue.
if (!process.env.PLAYWRIGHT_TEST) {
  db.$queryRawUnsafe("PRAGMA journal_mode=WAL;").catch((err) =>
    console.error("Failed to enable SQLite WAL mode:", err)
  );
  db.$queryRawUnsafe("PRAGMA busy_timeout=5000;").catch((err) =>
    console.error("Failed to set SQLite busy_timeout:", err)
  );
}
