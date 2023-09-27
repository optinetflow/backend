-- CreateTable
CREATE TABLE "ClinetStat" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiryTime" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "down" INTEGER NOT NULL,
    "email" INTEGER NOT NULL,
    "enable" BOOLEAN NOT NULL,

    CONSTRAINT "ClinetStat_pkey" PRIMARY KEY ("id")
);
