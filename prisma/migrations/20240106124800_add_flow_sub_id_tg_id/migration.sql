/*
  Warnings:

  - Added the required column `flow` to the `ClientStat` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subId` to the `ClientStat` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tgId` to the `ClientStat` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ClientStat" ADD COLUMN     "flow" VARCHAR(255) NOT NULL,
ADD COLUMN     "subId" VARCHAR(255) NOT NULL,
ADD COLUMN     "tgId" VARCHAR(255) NOT NULL;
