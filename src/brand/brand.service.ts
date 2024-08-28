import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';

@Injectable()
export class BrandService {
  constructor(private prisma: PrismaService) {}

  async getBrands() {
    return this.prisma.brand.findMany({});
  }

  async getFirstBrand() {
    return this.prisma.brand.findFirst({});
  }
}
