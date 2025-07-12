/*
  Warnings:

  - A unique constraint covering the columns `[category]` on the table `ActiveServer` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "ActiveServer_category_activeServerId_key";

-- CreateIndex
CREATE UNIQUE INDEX "ActiveServer_category_key" ON "ActiveServer"("category");
