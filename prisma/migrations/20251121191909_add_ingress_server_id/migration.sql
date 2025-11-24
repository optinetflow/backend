-- AlterTable
ALTER TABLE "ActiveServer" ADD COLUMN     "country" "Country" NOT NULL DEFAULT 'de';

-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "ingressServerId" UUID,
ADD COLUMN     "name" VARCHAR(255);

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_ingressServerId_fkey" FOREIGN KEY ("ingressServerId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;
