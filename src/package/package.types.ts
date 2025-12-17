import { Package, Server, UserPackage as UserPackagePrisma } from '../generated/prisma/client';

export interface CreatePackageInput {
  id: string;
  subId: string;
  email: string;
  server: Server;
  userPackageId: string;
  name: string;
  package: Package;
  orderN: number;
  isFree?: boolean;
  bundleGroupSize?: number;
  bundleGroupKey?: string;
  durationMonths?: number;
}
