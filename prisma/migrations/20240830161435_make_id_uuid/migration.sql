/*
  Warnings:

  - The primary key for the `TelegramUser` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `TelegramUser` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- DropIndex
DROP INDEX "TelegramUser_phone_key";

-- AlterTable
ALTER TABLE "TelegramUser" DROP CONSTRAINT "TelegramUser_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD CONSTRAINT "TelegramUser_pkey" PRIMARY KEY ("id");
