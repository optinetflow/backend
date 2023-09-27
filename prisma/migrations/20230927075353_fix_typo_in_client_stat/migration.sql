/*
  Warnings:

  - You are about to drop the `ClinetStat` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "ClinetStat";

-- CreateTable
CREATE TABLE "ClientStat" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiryTime" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "down" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "enable" BOOLEAN NOT NULL,

    CONSTRAINT "ClientStat_pkey" PRIMARY KEY ("id")
);
