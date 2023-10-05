/*
  Warnings:

  - The values [NL,DE] on the enum `PackageType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PackageType_new" AS ENUM ('NL_1M', 'NL_3M', 'NL_6M');
ALTER TABLE "Package" ALTER COLUMN "type" TYPE "PackageType_new" USING ("type"::text::"PackageType_new");
ALTER TYPE "PackageType" RENAME TO "PackageType_old";
ALTER TYPE "PackageType_new" RENAME TO "PackageType";
DROP TYPE "PackageType_old";
COMMIT;
