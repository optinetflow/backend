import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';

import { Brand } from './models/brand.model';

@Injectable()
export class BrandService {
  constructor(private prisma: PrismaService) {}

  async getBrands() {
    return this.prisma.brand.findMany({});
  }

  async getFirstBrand() {
    return this.prisma.brand.findFirst({});
  }

  async getBrandByDomainName(domainName: string): Promise<Brand> {
    return this.prisma.brand.findUniqueOrThrow({
      where: {
        domainName,
      },
    });
  }
}
