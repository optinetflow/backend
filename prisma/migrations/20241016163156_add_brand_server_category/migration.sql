/*
  Warnings:

  - You are about to drop the column `activeServerId` on the `Brand` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Brand" DROP CONSTRAINT "Brand_activeServerId_fkey";

-- DropIndex
DROP INDEX "Brand_activeServerId_key";

-- AlterTable
ALTER TABLE "Brand" DROP COLUMN "activeServerId";

-- CreateTable
CREATE TABLE "BrandServerCategory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "brandId" UUID NOT NULL,
    "category" "PackageCategory" NOT NULL,
    "activeServerId" UUID NOT NULL,

    CONSTRAINT "BrandServerCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrandServerCategory_brandId_category_key" ON "BrandServerCategory"("brandId", "category");

-- AddForeignKey
ALTER TABLE "BrandServerCategory" ADD CONSTRAINT "BrandServerCategory_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandServerCategory" ADD CONSTRAINT "BrandServerCategory_activeServerId_fkey" FOREIGN KEY ("activeServerId") REFERENCES "Server"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
