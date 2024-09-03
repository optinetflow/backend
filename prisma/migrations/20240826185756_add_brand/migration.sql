/*
  Warnings:

  - A unique constraint covering the columns `[phone,brandId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "User_phone_key";

-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "brandId" UUID;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "brandId" UUID;

-- CreateTable
CREATE TABLE "Brand" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "domainName" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "botToken" VARCHAR(255) NOT NULL,
    "botUsername" VARCHAR(255) NOT NULL,
    "logo" JSONB,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Brand_domainName_key" ON "Brand"("domainName");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_botUsername_key" ON "Brand"("botUsername");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_brandId_key" ON "User"("phone", "brandId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
