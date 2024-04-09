/*
  Warnings:

  - You are about to drop the column `userId` on the `Promotion` table. All the data in the column will be lost.
  - Added the required column `parentUserId` to the `Promotion` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Promotion" DROP CONSTRAINT "Promotion_userId_fkey";

-- AlterTable
ALTER TABLE "Promotion" DROP COLUMN "userId",
ADD COLUMN     "parentUserId" UUID NOT NULL;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
