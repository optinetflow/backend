-- AlterTable
ALTER TABLE "TelegramUser" ALTER COLUMN "phone" DROP NOT NULL;

-- CreateTable
CREATE TABLE "BankCard" (
    "id" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,

    CONSTRAINT "BankCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankCard_number_key" ON "BankCard"("number");

-- CreateIndex
CREATE INDEX "BankCardUserIdIndex" ON "BankCard"("userId");

-- AddForeignKey
ALTER TABLE "BankCard" ADD CONSTRAINT "BankCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "TelegramuUserIdIndex" RENAME TO "TelegramUserUserIdIndex";
