-- AlterTable
ALTER TABLE "Project" ADD COLUMN "description" TEXT;
ALTER TABLE "Project" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;
