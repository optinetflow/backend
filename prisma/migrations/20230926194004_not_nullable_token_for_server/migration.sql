/*
  Warnings:

  - Made the column `token` on table `Server` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Server" ALTER COLUMN "token" SET NOT NULL;
