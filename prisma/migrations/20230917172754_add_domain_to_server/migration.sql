/*
  Warnings:

  - A unique constraint covering the columns `[domain]` on the table `Server` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `domain` to the `Server` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "domain" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Server_domain_key" ON "Server"("domain");
