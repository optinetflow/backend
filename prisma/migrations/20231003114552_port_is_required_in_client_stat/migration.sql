/*
  Warnings:

  - Made the column `port` on table `ClientStat` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "ClientStat" ALTER COLUMN "port" SET NOT NULL;
