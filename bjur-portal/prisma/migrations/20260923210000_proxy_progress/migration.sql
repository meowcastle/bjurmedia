-- Encode progress, 0-100 while a proxy is being made and NULL otherwise.
-- A plain nullable column: SQLite adds this in place, no table rebuild, so it does not
-- need the exclusive lock the redefine migrations do.
ALTER TABLE "Asset" ADD COLUMN "proxyProgress" INTEGER;
