-- AlterTable
ALTER TABLE "UserPackage" ADD COLUMN     "orderN" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "UserPackageOrderNIndex" ON "UserPackage"("orderN");
