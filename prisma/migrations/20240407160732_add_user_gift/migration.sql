-- CreateTable
CREATE TABLE "UserGift" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "userId" UUID NOT NULL,
    "giftPackageId" UUID,
    "isGiftUsed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserGift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserGiftUserIdIndex" ON "UserGift"("userId");

-- CreateIndex
CREATE INDEX "UserGiftIsGiftUsedIndex" ON "UserGift"("isGiftUsed");

-- CreateIndex
CREATE INDEX "PromotionCodeIndex" ON "Promotion"("code");

-- AddForeignKey
ALTER TABLE "UserGift" ADD CONSTRAINT "UserGift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGift" ADD CONSTRAINT "UserGift_giftPackageId_fkey" FOREIGN KEY ("giftPackageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;
