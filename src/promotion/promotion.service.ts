import { ConflictException, Injectable, NotAcceptableException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';

import { roundTo } from '../common/helpers';
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

    if (data.initialDiscountPercent) {
      const maxDiscount = (user.profitPercent / (100 + user.profitPercent)) * 100;

      if (maxDiscount < data.initialDiscountPercent) {
        throw new NotAcceptableException(
          `با این درصد تخفیف شما ضرر می‌کنید. بالاترین درصد تخفیف که ضرر نکنید ${roundTo(maxDiscount, 2)}٪ است.`,
        );
      }
    }

    if (data.isForFreePackageSharing === true) {
      const alreadyIsForFreePackageSharingExist = await this.prisma.promotion.findFirst({
        where: { parentUserId: user.id, isForFreePackageSharing: true },
      });

      if (alreadyIsForFreePackageSharingExist) {
        throw new ConflictException(this.i18.__('promotion.error.already_is_for_free_package_sharing'));
      }
    }

    return this.prisma.promotion.create({
      data: {
        code: data.code,
        parentUserId: user.id,
        giftPackageId: data.giftPackageId,
        ...(data.initialDiscountPercent && { initialDiscountPercent: data.initialDiscountPercent }),
        ...(data.isForFreePackageSharing && { isForFreePackageSharing: data.isForFreePackageSharing }),
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
      orderBy: [{ isForFreePackageSharing: 'desc' }, { createdAt: 'desc' }],
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
