/*
  Warnings:

  - You are about to drop the `Arvan` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Domain` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Domain" DROP CONSTRAINT "Domain_arvanId_fkey";

-- DropForeignKey
ALTER TABLE "Domain" DROP CONSTRAINT "Domain_serverId_fkey";

-- DropTable
DROP TABLE "Arvan";

-- DropTable
DROP TABLE "Domain";

-- DropEnum
DROP TYPE "DomainState";
