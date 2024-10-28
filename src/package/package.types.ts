import { Package, Server, UserPackage as UserPackagePrisma } from '@prisma/client';

export interface CreatePackageInput {
  id: string;
  subId: string;
  email: string;
  server: Server;
  userPackageId: string;
  name: string;
  package: Package;
  orderN: number;
}
