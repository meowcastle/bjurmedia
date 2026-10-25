-- AlterTable
ALTER TABLE "Client" ADD COLUMN "websiteDomain" TEXT;
ALTER TABLE "Client" ADD COLUMN "instagramHandle" TEXT;
ALTER TABLE "Client" ADD COLUMN "youtubeHandle" TEXT;
ALTER TABLE "Client" ADD COLUMN "logoSource" TEXT;
ALTER TABLE "Client" ADD COLUMN "logoFetchedAt" DATETIME;
ALTER TABLE "Client" ADD COLUMN "logoCheckedAt" DATETIME;
ALTER TABLE "Client" ADD COLUMN "logoCheckRequestedAt" DATETIME;
ALTER TABLE "Client" ADD COLUMN "logoLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Client" ADD COLUMN "logoColor" TEXT;
