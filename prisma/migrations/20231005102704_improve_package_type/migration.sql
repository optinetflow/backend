/*
  Warnings:

  - The values [NL_1M,NL_3M,NL_6M] on the enum `PackageType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PackageType_new" AS ENUM ('M1_20G', 'M1_40G', 'M1_60G', 'M1_80G', 'M1_100G', 'M1_120G', 'M1_160G', 'M1_200G', 'M3_60G', 'M3_120G', 'M3_180G', 'M3_240G', 'M3_300G', 'M3_360G', 'M3_480G', 'M3_600G', 'M6_120G', 'M6_240G', 'M6_360G', 'M6_480G', 'M6_600G', 'M6_720G', 'M6_960G', 'M6_1200G');
ALTER TABLE "Package" ALTER COLUMN "type" TYPE "PackageType_new" USING ("type"::text::"PackageType_new");
ALTER TYPE "PackageType" RENAME TO "PackageType_old";
ALTER TYPE "PackageType_new" RENAME TO "PackageType";
DROP TYPE "PackageType_old";
COMMIT;
