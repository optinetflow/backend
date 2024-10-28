/*
  Warnings:

  - Made the column `brandId` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_brandId_fkey";

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "brandId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
