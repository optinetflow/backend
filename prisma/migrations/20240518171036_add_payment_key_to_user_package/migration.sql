/*
  Warnings:

  - A unique constraint covering the columns `[paymentKey]` on the table `UserPackage` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "UserPackage" ADD COLUMN     "paymentKey" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "UserPackage_paymentKey_key" ON "UserPackage"("paymentKey");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_key_fkey" FOREIGN KEY ("key") REFERENCES "UserPackage"("paymentKey") ON DELETE SET NULL ON UPDATE CASCADE;
