import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';

import { Brand } from './models/brand.model';

@Injectable()
export class BrandService {
  constructor(private prisma: PrismaService) {}

  async getBrands() {
    return this.prisma.brand.findMany({ where: { deletedAt: null } });
  }

  async getFirstBrand() {
    return this.prisma.brand.findFirst({ where: { deletedAt: null, id: 'da99bcd1-4a96-416f-bc38-90c5b363573e' } });
  }

  async getBrandByDomainName(domainName: string): Promise<Brand> {
    return this.prisma.brand.findUniqueOrThrow({
      where: {
        domainName,
        deletedAt: null,
      },
    });
  }
}
