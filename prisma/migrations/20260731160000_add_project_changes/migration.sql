-- CreateEnum
CREATE TYPE "ChangeStatus" AS ENUM ('PROPOSED', 'APPLIED', 'DISCARDED');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "nextChangeSequence" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ProjectChange" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "request" TEXT NOT NULL,
    "status" "ChangeStatus" NOT NULL DEFAULT 'PROPOSED',
    "baseSpecId" TEXT NOT NULL,
    "proposalPath" TEXT,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectChangeImpact" (
    "id" TEXT NOT NULL,
    "changeId" TEXT NOT NULL,
    "buildUnitId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "ProjectChangeImpact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectChange_projectId_createdAt_idx" ON "ProjectChange"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectChange_projectId_sequence_key" ON "ProjectChange"("projectId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectChangeImpact_changeId_buildUnitId_key" ON "ProjectChangeImpact"("changeId", "buildUnitId");

-- AddForeignKey
ALTER TABLE "ProjectChange" ADD CONSTRAINT "ProjectChange_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChange" ADD CONSTRAINT "ProjectChange_baseSpecId_fkey" FOREIGN KEY ("baseSpecId") REFERENCES "ProjectSpec"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChangeImpact" ADD CONSTRAINT "ProjectChangeImpact_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "ProjectChange"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChangeImpact" ADD CONSTRAINT "ProjectChangeImpact_buildUnitId_fkey" FOREIGN KEY ("buildUnitId") REFERENCES "ProjectBuildUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
