-- AlterTable
ALTER TABLE "User" ADD COLUMN     "joinedPromotionCode" VARCHAR(255),
ADD COLUMN     "joinedPromotionId" UUID;

-- CreateIndex
CREATE INDEX "UserJoinedPromotionIndex" ON "User"("joinedPromotionId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_joinedPromotionId_fkey" FOREIGN KEY ("joinedPromotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
