/*
  Warnings:

  - You are about to drop the column `discountAmount` on the `Payment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Package" ALTER COLUMN "expirationDays" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "price" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "discountAmount",
ADD COLUMN     "parentProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "profitAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "amount" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "parentId" UUID,
ADD COLUMN     "profitBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "balance" SET DEFAULT 0,
ALTER COLUMN "balance" SET DATA TYPE DOUBLE PRECISION;
