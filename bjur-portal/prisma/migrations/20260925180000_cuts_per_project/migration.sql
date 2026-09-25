-- Cut numbers belong to the project, not to one file.
--
-- The old number was the asset's reingestCount + 1, which only advances when the *same
-- filename* is dropped again. A real edit does not work that way: "AK MV HURT v4.mov"
-- then "AK Hurt v5.mov" are two assets, each on its first ingest, so the project page
-- listed "Cut 1" twice and the second export never read as the second cut.
--
-- sourceGen keeps what reingestCount used to be doing: it records which generation of
-- the file a cut was opened on, so re-dropping the same filename still opens the next
-- cut while a mere re-encode of the same bytes does not.
ALTER TABLE "Review" ADD COLUMN "sourceGen" INTEGER NOT NULL DEFAULT 0;

-- Existing rows: version was reingestCount + 1, so the generation is version - 1.
UPDATE "Review" SET "sourceGen" = "version" - 1;

-- Renumber every cut in order of when it opened, per project. Notes hang off reviewId,
-- never off the number, so this only changes what the screens say.
WITH ordered AS (
  SELECT r."id" AS id,
         ROW_NUMBER() OVER (PARTITION BY a."projectId" ORDER BY r."createdAt", r."rowid") AS n
  FROM "Review" r
  JOIN "Asset" a ON a."id" = r."assetId"
)
UPDATE "Review"
SET "version" = (SELECT n FROM ordered WHERE ordered.id = "Review"."id")
WHERE "id" IN (SELECT id FROM ordered);
