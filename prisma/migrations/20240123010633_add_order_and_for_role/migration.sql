-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "forRole" "Role"[] DEFAULT ARRAY['ADMIN', 'USER']::"Role"[],
ADD COLUMN     "order" INTEGER;
