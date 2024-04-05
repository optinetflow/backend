-- AlterTable
ALTER TABLE "User" ADD COLUMN     "appliedDiscountPercent" DOUBLE PRECISION,
ADD COLUMN     "initialDiscountPercent" DOUBLE PRECISION,
ADD COLUMN     "profitPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
