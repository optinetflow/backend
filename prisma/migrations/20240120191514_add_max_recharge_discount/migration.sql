/*
  Warnings:

  - You are about to drop the column `maxRechargeDiscountPercent` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "maxRechargeDiscountPercent",
ADD COLUMN     "maxRechargeDiscount" DOUBLE PRECISION NOT NULL DEFAULT 50;
