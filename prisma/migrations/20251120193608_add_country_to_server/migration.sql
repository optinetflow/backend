/*
  Warnings:

  - You are about to drop the column `type` on the `Server` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "Country" AS ENUM ('ir', 'de', 'us', 'nl', 'tr', 'fr', 'ca', 'sg', 'au', 'fi', 'gb');

-- AlterTable
ALTER TABLE "Server" DROP COLUMN "type",
ADD COLUMN     "country" "Country" NOT NULL DEFAULT 'de';

-- DropEnum
DROP TYPE "ServerCountry";
