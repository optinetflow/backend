/*
  Warnings:

  - You are about to drop the column `paymentId` on the `UserPackage` table. All the data in the column will be lost.
  - You are about to drop the column `paymentKey` on the `UserPackage` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_key_fkey";

-- DropForeignKey
ALTER TABLE "UserPackage" DROP CONSTRAINT "UserPackage_paymentId_fkey";

-- DropIndex
DROP INDEX "UserPackage_paymentKey_key";

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "userPackageId" UUID;

-- AlterTable
ALTER TABLE "UserPackage" DROP COLUMN "paymentId",
DROP COLUMN "paymentKey";

-- CreateIndex
CREATE INDEX "PaymentUserIdIndex" ON "Payment"("payerId");

-- CreateIndex
CREATE INDEX "PaymentUserPackageIdIndex" ON "Payment"("userPackageId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userPackageId_fkey" FOREIGN KEY ("userPackageId") REFERENCES "UserPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
