/*
  Warnings:

  - Added the required column `limitIp` to the `ClientStat` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ClientStat" ADD COLUMN     "limitIp" INTEGER NOT NULL;
