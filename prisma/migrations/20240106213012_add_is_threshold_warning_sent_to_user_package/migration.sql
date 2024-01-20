-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentType" ADD VALUE 'REVERT_PACKAGE_PURCHASE';
ALTER TYPE "PaymentType" ADD VALUE 'REVERT_WALLET_RECHARGE';

-- AlterTable
ALTER TABLE "UserPackage" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "isThresholdWarningSent" BOOLEAN NOT NULL DEFAULT false;
