-- CreateEnum
CREATE TYPE "BuildUnitStatus" AS ENUM ('SPECCED', 'IN_PROGRESS', 'SHIPPED', 'DEFERRED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "BuildUnitVerified" AS ENUM ('NONE', 'STRUCTURAL', 'PARTIAL', 'BROWSER');

-- CreateEnum
CREATE TYPE "BuildUnitSource" AS ENUM ('MANUAL', 'SPEC');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "nextBuildUnitSequence" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ProjectBuildUnit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "status" "BuildUnitStatus" NOT NULL DEFAULT 'SPECCED',
    "verified" "BuildUnitVerified" NOT NULL DEFAULT 'NONE',
    "source" "BuildUnitSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBuildUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBuildUnit_projectId_key_key" ON "ProjectBuildUnit"("projectId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBuildUnit_projectId_sequence_key" ON "ProjectBuildUnit"("projectId", "sequence");

-- AddForeignKey
ALTER TABLE "ProjectBuildUnit" ADD CONSTRAINT "ProjectBuildUnit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
