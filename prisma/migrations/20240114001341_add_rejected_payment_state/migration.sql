/*
  Warnings:

  - The values [REVERT_PACKAGE_PURCHASE,REVERT_WALLET_RECHARGE] on the enum `PaymentType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
ALTER TYPE "PaymentState" ADD VALUE 'REJECTED';

-- AlterEnum
BEGIN;
CREATE TYPE "PaymentType_new" AS ENUM ('PACKAGE_PURCHASE', 'WALLET_RECHARGE', 'SERVER_COST');
ALTER TABLE "Payment" ALTER COLUMN "type" TYPE "PaymentType_new" USING ("type"::text::"PaymentType_new");
ALTER TYPE "PaymentType" RENAME TO "PaymentType_old";
ALTER TYPE "PaymentType_new" RENAME TO "PaymentType";
DROP TYPE "PaymentType_old";
COMMIT;
