-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "captionEditedAt" DATETIME;
ALTER TABLE "Asset" ADD COLUMN "captionEditedBy" TEXT;
ALTER TABLE "Asset" ADD COLUMN "transcriptSegments" JSONB;
