/*
  Warnings:

  - A unique constraint covering the columns `[phone,domainName]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "DomainName" AS ENUM ('vaslkon.com', 'radshim.com');

-- DropIndex
DROP INDEX "User_phone_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "domainName" "DomainName";

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_domainName_key" ON "User"("phone", "domainName");
