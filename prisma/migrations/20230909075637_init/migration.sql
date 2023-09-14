-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "DomainState" AS ENUM ('PENDING', 'APPLIED');

-- CreateEnum
CREATE TYPE "ServerCountry" AS ENUM ('NL', 'DE');

-- CreateEnum
CREATE TYPE "PackageType" AS ENUM ('NL', 'DE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "phone" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstname" TEXT,
    "lastname" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "domain" TEXT NOT NULL,
    "expiredAt" TIMESTAMP(3) NOT NULL,
    "nsState" "DomainState" NOT NULL DEFAULT 'PENDING',
    "arvanSslState" "DomainState" NOT NULL DEFAULT 'PENDING',
    "letsEncryptSsl" "DomainState" NOT NULL DEFAULT 'PENDING',
    "arvanId" TEXT NOT NULL,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Arvan" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "token" TEXT,
    "tokenExpiredAt" TIMESTAMP(3),
    "ns1" TEXT NOT NULL,
    "ns2" TEXT NOT NULL,

    CONSTRAINT "Arvan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Server" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "type" "ServerCountry" NOT NULL,
    "ip" TEXT NOT NULL,
    "token" TEXT,

    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "type" "PackageType" NOT NULL,
    "expiredAt" TIMESTAMP(3) NOT NULL,
    "traffic" INTEGER NOT NULL,
    "download" INTEGER NOT NULL,
    "upload" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "Arvan_email_key" ON "Arvan"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Server_ip_key" ON "Server"("ip");

-- CreateIndex
CREATE INDEX "PackageUserIdIndex" ON "Package"("userId");

-- CreateIndex
CREATE INDEX "PackageServerIdIndex" ON "Package"("serverId");

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_arvanId_fkey" FOREIGN KEY ("arvanId") REFERENCES "Arvan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Arvan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
