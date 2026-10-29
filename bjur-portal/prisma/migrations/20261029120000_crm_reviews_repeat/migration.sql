-- CRM Phase 4 (Modules 6 and 7). Two plain nullable columns, no table rebuild.
ALTER TABLE "Review" ADD COLUMN "nudgedAt" DATETIME;
ALTER TABLE "Review" ADD COLUMN "punchListAt" DATETIME;

-- Notes sent before this shipped were already read by email. Starting the punch-list
-- clock at the latest one keeps the first run from posting every old round to Slack.
UPDATE "Review" SET "punchListAt" = (
  SELECT MAX("sentAt") FROM "ReviewNote" WHERE "ReviewNote"."reviewId" = "Review"."id"
);
