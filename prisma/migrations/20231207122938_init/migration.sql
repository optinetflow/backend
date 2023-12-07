-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "DomainState" AS ENUM ('PENDING', 'APPLIED');

-- CreateEnum
CREATE TYPE "ServerCountry" AS ENUM ('NL', 'DE', 'TR');

-- CreateEnum
CREATE TYPE "PaymentState" AS ENUM ('PENDING', 'APPLIED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "phone" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstname" TEXT,
    "lastname" TEXT,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "role" "Role" NOT NULL DEFAULT 'USER',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Domain" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "domain" TEXT NOT NULL,
    "expiredAt" TIMESTAMP(3) NOT NULL,
    "nsState" "DomainState" NOT NULL DEFAULT 'PENDING',
    "arvanSslState" "DomainState" NOT NULL DEFAULT 'PENDING',
    "letsEncryptSsl" "DomainState" NOT NULL DEFAULT 'PENDING',
    "port" INTEGER,
    "isAutomated" BOOLEAN,
    "arvanId" UUID NOT NULL,
    "serverId" UUID NOT NULL,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Arvan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "token" TEXT,
    "tokenExpiredAt" TIMESTAMP(3),
    "nsKeys" TEXT[],

    CONSTRAINT "Arvan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Server" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "type" "ServerCountry" NOT NULL,
    "ip" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "inboundId" INTEGER NOT NULL DEFAULT 1,
    "token" TEXT NOT NULL,

    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "traffic" INTEGER NOT NULL,
    "expirationDays" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "userCount" INTEGER NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPackage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "packageId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "serverId" UUID NOT NULL,
    "statId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,

    CONSTRAINT "UserPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientStat" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiryTime" BIGINT NOT NULL,
    "total" BIGINT NOT NULL,
    "down" BIGINT NOT NULL,
    "up" BIGINT NOT NULL,
    "email" TEXT NOT NULL,
    "enable" BOOLEAN NOT NULL,
    "serverId" UUID NOT NULL,

    CONSTRAINT "ClientStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PaymentState" NOT NULL DEFAULT 'PENDING',
    "payerId" UUID NOT NULL,
    "discountAmount" INTEGER,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "UserRoleIndex" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_domain_key" ON "Domain"("domain");

-- CreateIndex
CREATE INDEX "DomainNsStateIndex" ON "Domain"("nsState");

-- CreateIndex
CREATE INDEX "DomainArvanSslStateIndex" ON "Domain"("arvanSslState");

-- CreateIndex
CREATE INDEX "DomainLetsEncryptSslIndex" ON "Domain"("letsEncryptSsl");

-- CreateIndex
CREATE INDEX "DomainArvanIdIndex" ON "Domain"("arvanId");

-- CreateIndex
CREATE INDEX "DomainServerIdIndex" ON "Domain"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "Arvan_email_key" ON "Arvan"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Server_ip_key" ON "Server"("ip");

-- CreateIndex
CREATE UNIQUE INDEX "Server_domain_key" ON "Server"("domain");

-- CreateIndex
CREATE INDEX "UserPackageUserIdIndex" ON "UserPackage"("userId");

-- CreateIndex
CREATE INDEX "UserPackageServerIdIndex" ON "UserPackage"("serverId");

-- CreateIndex
CREATE INDEX "UserPackageStatIdIndex" ON "UserPackage"("statId");

-- CreateIndex
CREATE INDEX "UserPackagePackageIdIndex" ON "UserPackage"("packageId");

-- CreateIndex
CREATE INDEX "ClientStatServerIdIndex" ON "ClientStat"("serverId");

-- CreateIndex
CREATE INDEX "ClientStatExpiryTimeIndex" ON "ClientStat"("expiryTime");

-- CreateIndex
CREATE INDEX "ClientStatTotalIndex" ON "ClientStat"("total");

-- CreateIndex
CREATE INDEX "ClientStatDownIndex" ON "ClientStat"("down");

-- CreateIndex
CREATE INDEX "ClientStatUpIndex" ON "ClientStat"("up");

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_arvanId_fkey" FOREIGN KEY ("arvanId") REFERENCES "Arvan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPackage" ADD CONSTRAINT "UserPackage_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPackage" ADD CONSTRAINT "UserPackage_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPackage" ADD CONSTRAINT "UserPackage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPackage" ADD CONSTRAINT "UserPackage_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPackage" ADD CONSTRAINT "UserPackage_statId_fkey" FOREIGN KEY ("statId") REFERENCES "ClientStat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStat" ADD CONSTRAINT "ClientStat_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
