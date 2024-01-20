/*
  Warnings:

  - You are about to drop the column `hasAvatar` on the `TelegramUser` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "TelegramUser" DROP COLUMN "hasAvatar",
ADD COLUMN     "avatar" VARCHAR(255);
