/*
  Warnings:

  - You are about to alter the column `email` on the `Arvan` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `nsKeys` on the `Arvan` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.

*/
-- AlterTable
ALTER TABLE "Arvan" ALTER COLUMN "email" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "nsKeys" SET DATA TYPE VARCHAR(255)[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "totalProfit" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TelegramUser" (
    "id" INTEGER NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "phone" TEXT NOT NULL,
    "firstname" VARCHAR(255) NOT NULL,
    "lastname" VARCHAR(255) NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "hasAvatar" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TelegramUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUser_userId_key" ON "TelegramUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUser_phone_key" ON "TelegramUser"("phone");

-- CreateIndex
CREATE INDEX "TelegramuUserIdIndex" ON "TelegramUser"("userId");

-- CreateIndex
CREATE INDEX "UserParentIdIndex" ON "User"("parentId");

-- AddForeignKey
ALTER TABLE "TelegramUser" ADD CONSTRAINT "TelegramUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
