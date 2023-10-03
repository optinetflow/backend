/*
  Warnings:

  - You are about to drop the column `port` on the `ClientStat` table. All the data in the column will be lost.
  - You are about to drop the column `download` on the `Package` table. All the data in the column will be lost.
  - You are about to drop the column `upload` on the `Package` table. All the data in the column will be lost.
  - Added the required column `domainId` to the `Package` table without a default value. This is not possible if the table is not empty.
  - Added the required column `statId` to the `Package` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Package" DROP CONSTRAINT "Package_userId_fkey";

-- AlterTable
ALTER TABLE "ClientStat" DROP COLUMN "port";

-- AlterTable
ALTER TABLE "Domain" ADD COLUMN     "isAutomated" BOOLEAN,
ADD COLUMN     "port" INTEGER;

-- AlterTable
ALTER TABLE "Package" DROP COLUMN "download",
DROP COLUMN "upload",
ADD COLUMN     "domainId" TEXT NOT NULL,
ADD COLUMN     "statId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "ClientStatExpiryTimeIndex" ON "ClientStat"("expiryTime");

-- CreateIndex
CREATE INDEX "ClientStatTotalIndex" ON "ClientStat"("total");

-- CreateIndex
CREATE INDEX "ClientStatDownIndex" ON "ClientStat"("down");

-- CreateIndex
CREATE INDEX "ClientStatUpIndex" ON "ClientStat"("up");

-- CreateIndex
CREATE INDEX "PackageStatIdIndex" ON "Package"("statId");

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_statId_fkey" FOREIGN KEY ("statId") REFERENCES "ClientStat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
