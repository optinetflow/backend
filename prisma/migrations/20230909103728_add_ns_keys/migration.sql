/*
  Warnings:

  - You are about to drop the column `ns1` on the `Arvan` table. All the data in the column will be lost.
  - You are about to drop the column `ns2` on the `Arvan` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Arvan" DROP COLUMN "ns1",
DROP COLUMN "ns2",
ADD COLUMN     "nsKeys" TEXT[];
