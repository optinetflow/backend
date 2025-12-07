/*
  Warnings:

  - You are about to drop the column `referId` on the `User` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_referId_fkey";

-- DropIndex
DROP INDEX "UserReferIdIndex";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "referId",
ADD COLUMN     "referParentId" UUID;

-- CreateIndex
CREATE INDEX "UserReferParentIdIndex" ON "User"("referParentId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referParentId_fkey" FOREIGN KEY ("referParentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
