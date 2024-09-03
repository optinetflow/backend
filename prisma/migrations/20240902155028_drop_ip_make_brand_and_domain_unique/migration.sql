/*
  Warnings:

  - You are about to drop the column `ip` on the `Server` table. All the data in the column will be lost.
  - You are about to alter the column `domain` on the `Server` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - A unique constraint covering the columns `[domain,brandId]` on the table `Server` will be added. If there are existing duplicate values, this will fail.
  - Made the column `tunnelDomain` on table `Server` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "Server_domain_key";

-- DropIndex
DROP INDEX "Server_ip_key";

-- AlterTable
ALTER TABLE "Server" DROP COLUMN "ip",
ALTER COLUMN "domain" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "tunnelDomain" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Server_domain_brandId_key" ON "Server"("domain", "brandId");
