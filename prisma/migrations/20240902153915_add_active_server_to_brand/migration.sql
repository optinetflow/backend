/*
  Warnings:

  - A unique constraint covering the columns `[activeServerId]` on the table `Brand` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "activeServerId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Brand_activeServerId_key" ON "Brand"("activeServerId");

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_activeServerId_fkey" FOREIGN KEY ("activeServerId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;
