/*
  Warnings:

  - Added the required column `name` to the `UserPackage` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "UserPackage" ADD COLUMN     "name" VARCHAR(255) NOT NULL;
