/*
  Warnings:

  - The primary key for the `BankCard` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `BankCard` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `File` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `File` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "BankCard" DROP CONSTRAINT "BankCard_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD CONSTRAINT "BankCard_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "File" DROP CONSTRAINT "File_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD CONSTRAINT "File_pkey" PRIMARY KEY ("id");
