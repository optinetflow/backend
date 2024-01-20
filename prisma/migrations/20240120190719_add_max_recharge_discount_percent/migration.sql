/*
  Warnings:

  - You are about to drop the column `maxRechageDiscountPercent` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "maxRechageDiscountPercent",
ADD COLUMN     "maxRechargeDiscountPercent" DOUBLE PRECISION;
