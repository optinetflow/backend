/*
  Warnings:

  - You are about to drop the column `avatar` on the `TelegramUser` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "TelegramUser" DROP COLUMN "avatar",
ADD COLUMN     "bigAvatar" VARCHAR(255),
ADD COLUMN     "smallAvatar" VARCHAR(255);
