-- Footage uploads become a per-client switch, off unless the studio turns it on.
--
-- Moving intake to the client handed every seat an upload page by accident: the old gate
-- required an open request on a specific project, and removing the project removed the
-- gate with it. That is a door opened on every account at once, which nobody asked for.
ALTER TABLE "Client" ADD COLUMN "footageUploads" BOOLEAN NOT NULL DEFAULT false;

-- Anyone already sending this way keeps sending. A batch with no requestId arrived from a
-- seat in the portal rather than through a link, so those clients are demonstrably using
-- it and switching them off mid-job would strand work in progress. Every other client
-- starts closed, which is the default from here on.
UPDATE "Client" SET "footageUploads" = true
WHERE "id" IN (SELECT DISTINCT "clientId" FROM "UploadBatch" WHERE "requestId" IS NULL);
