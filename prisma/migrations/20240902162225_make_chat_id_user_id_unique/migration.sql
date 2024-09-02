/*
  Warnings:

  - A unique constraint covering the columns `[chatId,userId]` on the table `TelegramUser` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "TelegramUser_chatId_userId_key" ON "TelegramUser"("chatId", "userId");
