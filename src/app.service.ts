import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'nestjs-prisma';

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  getHelloName(name: string): string {
    return `Hello ${name}!`;
  }

  async updateUserJoinedPromotionCodeOptimized() {
    // Step 1: Fetch all UserGift records with a promotionId
    const userGifts = await this.prisma.userGift.findMany({
      where: {
        promotionId: {
          not: null,
        },
      },
      select: {
        userId: true,
        promotionId: true,
      },
    });

    if (userGifts.length === 0) {
      // No updates needed
      return;
    }

    // Step 2: Extract unique promotionIds
    const promotionIds = [...new Set(userGifts.map((gift) => gift.promotionId))] as string[];

    // Step 3: Fetch all Promotions with the extracted promotionIds
    const promotions = await this.prisma.promotion.findMany({
      where: {
        id: {
          in: promotionIds,
        },
      },
      select: {
        id: true,
        code: true,
      },
    });

    // Step 4: Create a mapping from promotionId to Promotion data
    const promotionMap: Record<string, { id: string; code: string }> = {};
    promotions.forEach((promo) => {
      promotionMap[promo.id] = { id: promo.id, code: promo.code };
    });

    // Step 5: Create a mapping from userId to the latest Promotion
    // Assuming that if a user has multiple UserGifts, we take the latest one based on some criteria.
    // Here, we simply take the first occurrence. Modify as needed.
    const userPromotionMap: Record<string, { joinedPromotionId: string; joinedPromotionCode: string }> = {};

    userGifts.forEach((gift) => {
      if (gift.promotionId && promotionMap[gift.promotionId]) {
        // If a user has multiple gifts, this will overwrite with the last one in the array.
        // Adjust logic here if you need a different selection criteria.
        userPromotionMap[gift.userId] = {
          joinedPromotionId: promotionMap[gift.promotionId].id,
          joinedPromotionCode: promotionMap[gift.promotionId].code,
        };
      }
    });

    // Step 6: Prepare bulk update operations
    const updateOperations: Array<Prisma.PrismaPromise<unknown>> = [];

    for (const [userId, promotionData] of Object.entries(userPromotionMap)) {
      updateOperations.push(
        this.prisma.user.update({
          where: { id: userId },
          data: {
            joinedPromotionId: promotionData.joinedPromotionId,
            joinedPromotionCode: promotionData.joinedPromotionCode,
          },
        }),
      );
    }

    // Step 7: Execute all updates in a single transaction
    await this.prisma.$transaction(updateOperations);
  }
}
