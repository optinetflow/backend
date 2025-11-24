/*
  Warnings:

  - A unique constraint covering the columns `[category]` on the table `ActiveServer` will be dropped.
  - A unique constraint covering the columns `[category,country]` on the table `ActiveServer` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "ActiveServer_category_key";

-- CreateIndex
CREATE UNIQUE INDEX "ActiveServer_category_country_key" ON "ActiveServer"("category", "country");

