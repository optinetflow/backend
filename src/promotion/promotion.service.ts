import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';

import { I18nService } from '../common/i18/i18.service';
import { Package } from '../package/models/package.model';
import { User } from '../users/models/user.model';
import { CreatePromotionInput } from './dto/create-promotion.input';
import { Promotion } from './models/promotion.model';

@Injectable()
export class PromotionService {
  constructor(private readonly prisma: PrismaService, private readonly i18: I18nService) {}

  async createPromotion(user: User, data: CreatePromotionInput): Promise<Promotion> {
    const existingPromotion = await this.prisma.promotion.findUnique({
      where: { code: data.code },
    });

    if (existingPromotion) {
      throw new ConflictException(this.i18.__('promotion.error.exists'));
    }

    let giftPackage: Package | null = null;

    if (data.giftPackageId) {
      giftPackage = await this.prisma.package.findUnique({
        where: { id: data.giftPackageId },
      });

      if (!giftPackage) {
        throw new NotFoundException('Gift package not found.');
      }
    }

    return this.prisma.promotion.create({
      data: {
        code: data.code,
        parentUserId: user.id,
        giftPackageId: data.giftPackageId,
      },
      include: {
        parentUser: true,
        giftPackage: true,
      },
    });
  }

  async getPromotionCodes(user: User) {
    return this.prisma.promotion.findMany({
      where: { parentUserId: user.id },
      orderBy: { createdAt: 'asc' },
      include: { giftPackage: true },
    });
  }

  async deletePromotion(user: User, promotionId: string) {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id: promotionId, parentUserId: user.id },
    });

    if (!promotion) {
      throw new NotFoundException(this.i18.__('promotion.error.not_found'));
    }

    await this.prisma.promotion.delete({
      where: { id: promotion.id },
    });

    return true;
  }
}
