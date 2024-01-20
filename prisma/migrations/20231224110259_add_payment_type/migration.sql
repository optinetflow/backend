/*
  Warnings:

  - Added the required column `type` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('PACKAGE_PURCHASE', 'WALLET_RECHARGE');

-- DropForeignKey
ALTER TABLE "UserPackage" DROP CONSTRAINT "UserPackage_packageId_fkey";

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "type" "PaymentType" NOT NULL;

-- AlterTable
ALTER TABLE "UserPackage" ALTER COLUMN "packageId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "UserPackage" ADD CONSTRAINT "UserPackage_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;
