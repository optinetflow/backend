/*
  Warnings:

  - You are about to drop the column `isThresholdWarningSent` on the `UserPackage` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "UserPackage" DROP COLUMN "isThresholdWarningSent",
ADD COLUMN     "thresholdWarningSentAt" TIMESTAMP(3);
