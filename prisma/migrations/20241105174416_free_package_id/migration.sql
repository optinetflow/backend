-- AlterTable
ALTER TABLE "User" ADD COLUMN     "freePackageId" UUID;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_freePackageId_fkey" FOREIGN KEY ("freePackageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;
