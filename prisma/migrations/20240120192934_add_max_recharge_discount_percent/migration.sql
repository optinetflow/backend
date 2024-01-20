/*
  Warnings:

  - You are about to drop the column `maxRechargeDiscount` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "maxRechargeDiscount",
ADD COLUMN     "maxRechargeDiscountPercent" DOUBLE PRECISION;
