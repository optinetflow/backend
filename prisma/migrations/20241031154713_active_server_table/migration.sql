/*
  Warnings:

  - You are about to drop the `BrandServerCategory` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "BrandServerCategory" DROP CONSTRAINT "BrandServerCategory_activeServerId_fkey";

-- DropForeignKey
ALTER TABLE "BrandServerCategory" DROP CONSTRAINT "BrandServerCategory_brandId_fkey";

-- DropTable
DROP TABLE "BrandServerCategory";

-- CreateTable
CREATE TABLE "ActiveServer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "brandId" UUID NOT NULL,
    "category" "PackageCategory" NOT NULL,
    "activeServerId" UUID NOT NULL,

    CONSTRAINT "ActiveServer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActiveServer_brandId_category_key" ON "ActiveServer"("brandId", "category");

-- AddForeignKey
ALTER TABLE "ActiveServer" ADD CONSTRAINT "ActiveServer_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveServer" ADD CONSTRAINT "ActiveServer_activeServerId_fkey" FOREIGN KEY ("activeServerId") REFERENCES "Server"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
