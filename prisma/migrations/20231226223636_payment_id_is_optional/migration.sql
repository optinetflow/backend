/*
  Warnings:

  - Made the column `packageId` on table `UserPackage` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "UserPackage" DROP CONSTRAINT "UserPackage_packageId_fkey";

-- DropForeignKey
ALTER TABLE "UserPackage" DROP CONSTRAINT "UserPackage_paymentId_fkey";

-- AlterTable
ALTER TABLE "UserPackage" ALTER COLUMN "packageId" SET NOT NULL,
ALTER COLUMN "paymentId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "UserPackage" ADD CONSTRAINT "UserPackage_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPackage" ADD CONSTRAINT "UserPackage_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
