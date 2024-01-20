-- AlterTable
ALTER TABLE "User" ADD COLUMN     "referId" UUID;

-- CreateIndex
CREATE INDEX "UserReferIdIndex" ON "User"("referId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referId_fkey" FOREIGN KEY ("referId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
