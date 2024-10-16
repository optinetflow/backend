-- CreateEnum
CREATE TYPE "PackageCategory" AS ENUM ('ECONOMIC', 'QUALITY');

-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "category" "PackageCategory" NOT NULL DEFAULT 'QUALITY';
