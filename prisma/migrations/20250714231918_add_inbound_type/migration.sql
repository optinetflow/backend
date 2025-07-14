-- CreateEnum
CREATE TYPE "InboundType" AS ENUM ('VLESS_TLS', 'VMESS');

-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "inboundType" "InboundType" NOT NULL DEFAULT 'VLESS_TLS';
