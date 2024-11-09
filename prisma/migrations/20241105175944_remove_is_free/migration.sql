/*
  Warnings:

  - You are about to drop the column `isFree` on the `Package` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Package" DROP COLUMN "isFree";

-- AlterTable
ALTER TABLE "UserPackage" ADD COLUMN     "isFree" BOOLEAN NOT NULL DEFAULT false;
