/*
  Warnings:

  - Made the column `serverId` on table `ClientStat` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "ClientStat" DROP CONSTRAINT "ClientStat_serverId_fkey";

-- AlterTable
ALTER TABLE "ClientStat" ALTER COLUMN "serverId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "ClientStat" ADD CONSTRAINT "ClientStat_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
