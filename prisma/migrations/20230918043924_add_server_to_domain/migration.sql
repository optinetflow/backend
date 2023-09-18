/*
  Warnings:

  - Added the required column `serverId` to the `Domain` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Domain" ADD COLUMN     "serverId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "DomainServerIdIndex" ON "Domain"("serverId");

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
