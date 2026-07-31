-- AlterEnum
ALTER TYPE "BuildUnitSource" ADD VALUE 'CHANGE';

-- AlterTable
ALTER TABLE "ProjectBuildUnit" ADD COLUMN     "changeId" TEXT,
ADD COLUMN     "supersededByChangeId" TEXT;

-- AddForeignKey
ALTER TABLE "ProjectBuildUnit" ADD CONSTRAINT "ProjectBuildUnit_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "ProjectChange"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBuildUnit" ADD CONSTRAINT "ProjectBuildUnit_supersededByChangeId_fkey" FOREIGN KEY ("supersededByChangeId") REFERENCES "ProjectChange"("id") ON DELETE SET NULL ON UPDATE CASCADE;
