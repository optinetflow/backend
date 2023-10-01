-- AlterTable
ALTER TABLE "ClientStat" ADD COLUMN     "serverId" TEXT;

-- CreateIndex
CREATE INDEX "ClientStatServerIdIndex" ON "ClientStat"("serverId");

-- AddForeignKey
ALTER TABLE "ClientStat" ADD CONSTRAINT "ClientStat_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;
