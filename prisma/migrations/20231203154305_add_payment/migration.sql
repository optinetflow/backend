/*
  Warnings:

  - You are about to drop the column `domainId` on the `Package` table. All the data in the column will be lost.
  - You are about to drop the column `expiredAt` on the `Package` table. All the data in the column will be lost.
  - You are about to drop the column `serverId` on the `Package` table. All the data in the column will be lost.
  - You are about to drop the column `statId` on the `Package` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Package` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Package` table. All the data in the column will be lost.
  - Added the required column `expirationDays` to the `Package` table without a default value. This is not possible if the table is not empty.
  - Added the required column `price` to the `Package` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userCount` to the `Package` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PaymentState" AS ENUM ('PENDING', 'APPLIED');

-- AlterEnum
ALTER TYPE "ServerCountry" ADD VALUE 'TR';

-- DropForeignKey
ALTER TABLE "Package" DROP CONSTRAINT "Package_domainId_fkey";

-- DropForeignKey
ALTER TABLE "Package" DROP CONSTRAINT "Package_serverId_fkey";

-- DropForeignKey
ALTER TABLE "Package" DROP CONSTRAINT "Package_statId_fkey";

-- DropForeignKey
ALTER TABLE "Package" DROP CONSTRAINT "Package_userId_fkey";

-- DropIndex
DROP INDEX "PackageServerIdIndex";

-- DropIndex
DROP INDEX "PackageStatIdIndex";

-- DropIndex
DROP INDEX "PackageUserIdIndex";

-- AlterTable
ALTER TABLE "Package" DROP COLUMN "domainId",
DROP COLUMN "expiredAt",
DROP COLUMN "serverId",
DROP COLUMN "statId",
DROP COLUMN "type",
DROP COLUMN "userId",
ADD COLUMN     "expirationDays" INTEGER NOT NULL,
ADD COLUMN     "price" INTEGER NOT NULL,
ADD COLUMN     "userCount" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "balance" INTEGER NOT NULL DEFAULT 0;

-- DropEnum
DROP TYPE "PackageType";

-- CreateTable
CREATE TABLE "UserPackage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "packageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "statId" TEXT NOT NULL,

    CONSTRAINT "UserPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PaymentState" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "payerId" TEXT NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserPackageUserIdIndex" ON "UserPackage"("userId");

-- CreateIndex
CREATE INDEX "UserPackageServerIdIndex" ON "UserPackage"("serverId");

-- CreateIndex
CREATE INDEX "UserPackageStatIdIndex" ON "UserPackage"("statId");

-- CreateIndex
CREATE INDEX "UserPackagePackageIdIndex" ON "UserPackage"("packageId");

-- AddForeignKey
ALTER TABLE "UserPackage" ADD CONSTRAINT "UserPackage_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPackage" ADD CONSTRAINT "UserPackage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPackage" ADD CONSTRAINT "UserPackage_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPackage" ADD CONSTRAINT "UserPackage_statId_fkey" FOREIGN KEY ("statId") REFERENCES "ClientStat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
