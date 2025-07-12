/*
  Warnings:

  - You are about to drop the column `brandId` on the `ActiveServer` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[category,activeServerId]` on the table `ActiveServer` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "ActiveServer" DROP CONSTRAINT "ActiveServer_brandId_fkey";

-- DropIndex
DROP INDEX "ActiveServer_brandId_category_key";

-- AlterTable
ALTER TABLE "ActiveServer" DROP COLUMN "brandId";

-- CreateIndex
CREATE UNIQUE INDEX "ActiveServer_category_activeServerId_key" ON "ActiveServer"("category", "activeServerId");
