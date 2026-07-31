-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "nextSpecVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ProjectBuildUnit" ADD COLUMN     "specId" TEXT;

-- AlterTable: `version` arrives nullable so existing rows survive the ADD, is
-- backfilled below, and is only then made NOT NULL.
ALTER TABLE "ProjectSpec" ADD COLUMN     "version" INTEGER;

-- Backfill: within each project, number the existing specs by `createdAt`
-- ascending, starting at 1. `id` breaks a `createdAt` tie so the numbering is
-- deterministic rather than dependent on scan order.
UPDATE "ProjectSpec" AS s
SET "version" = numbered."version"
FROM (
    SELECT
        "id",
        ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "createdAt" ASC, "id" ASC) AS "version"
    FROM "ProjectSpec"
) AS numbered
WHERE s."id" = numbered."id";

-- Each project's counter continues from its highest existing version. A project
-- with no specs keeps the DEFAULT 1 and generates its first as Version 1.
UPDATE "Project" AS p
SET "nextSpecVersion" = counted."next"
FROM (
    SELECT "projectId", COUNT(*) + 1 AS "next"
    FROM "ProjectSpec"
    GROUP BY "projectId"
) AS counted
WHERE p."id" = counted."projectId";

-- AlterTable
ALTER TABLE "ProjectSpec" ALTER COLUMN "version" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSpec_projectId_version_key" ON "ProjectSpec"("projectId", "version");

-- AddForeignKey
ALTER TABLE "ProjectBuildUnit" ADD CONSTRAINT "ProjectBuildUnit_specId_fkey" FOREIGN KEY ("specId") REFERENCES "ProjectSpec"("id") ON DELETE SET NULL ON UPDATE CASCADE;
