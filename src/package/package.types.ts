import { Package, Server, UserPackage as UserPackagePrisma } from '@prisma/client';

export interface CreatePackageInput {
  id: string;
  subId: string;
  email: string;
  server: Server;
  paymentKey?: string;
  name: string;
  package: Package;
  orderN: number;
}

export interface SendBuyPackMessageInput {
  receiptBuffer?: Buffer;
  userPack: UserPackagePrisma;
  pack: Package;
  parentProfit?: number;
  profitAmount?: number;
  inRenew: boolean;
}
