-- AddLastNegativeBalanceNotificationAtToUser
ALTER TABLE "User" ADD COLUMN "lastNegativeBalanceNotificationAt" TIMESTAMP(3);
