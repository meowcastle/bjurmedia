-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "orientation" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relPath" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "dims" TEXT,
    "durationSec" INTEGER,
    "masterCodec" TEXT,
    "proxyStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "proxyRelPath" TEXT,
    "thumbRelPath" TEXT,
    "proxyRes" TEXT,
    "reingestCount" INTEGER NOT NULL DEFAULT 0,
    "lastReplacedAt" DATETIME,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "licensable" BOOLEAN NOT NULL DEFAULT false,
    "basePrice" INTEGER,
    "weekOf" DATETIME,
    "contentTitle" TEXT,
    "caption" TEXT,
    "captionYT" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Asset" ("basePrice", "caption", "captionYT", "contentTitle", "createdAt", "dims", "durationSec", "format", "id", "internal", "kind", "licensable", "masterCodec", "name", "orientation", "projectId", "proxyRelPath", "proxyRes", "proxyStatus", "relPath", "sizeBytes", "thumbRelPath", "updatedAt", "weekOf") SELECT "basePrice", "caption", "captionYT", "contentTitle", "createdAt", "dims", "durationSec", "format", "id", "internal", "kind", "licensable", "masterCodec", "name", "orientation", "projectId", "proxyRelPath", "proxyRes", "proxyStatus", "relPath", "sizeBytes", "thumbRelPath", "updatedAt", "weekOf" FROM "Asset";
DROP TABLE "Asset";
ALTER TABLE "new_Asset" RENAME TO "Asset";
CREATE INDEX "Asset_projectId_idx" ON "Asset"("projectId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
