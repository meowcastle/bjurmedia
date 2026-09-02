-- AlterTable
ALTER TABLE "Project" ADD COLUMN "deliveryNotifiedAt" DATETIME;
ALTER TABLE "Project" ADD COLUMN "deliveryPendingAt" DATETIME;
ALTER TABLE "Project" ADD COLUMN "deliveryPendingSince" DATETIME;
