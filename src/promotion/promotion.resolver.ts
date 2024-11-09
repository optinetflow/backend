// src/promotions/promotion.resolver.ts

import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import { AdminGqlAuthGuard } from '../auth/gql-auth.guard';
import { UserEntity } from '../common/decorators/user.decorator';
import { User } from '../users/models/user.model';
import { CreatePromotionInput } from './dto/create-promotion.input';
import { DeletePromotionInput } from './dto/delete-promotion.input';
import { Promotion } from './models/promotion.model';
import { PromotionService } from './promotion.service';

@Resolver()
export class PromotionResolver {
  constructor(private readonly promotionService: PromotionService) {}

  @UseGuards(AdminGqlAuthGuard)
  @Mutation(() => Promotion)
  async createPromotionCode(@UserEntity() user: User, @Args('data') data: CreatePromotionInput): Promise<Promotion> {
    return this.promotionService.createPromotion(user, data);
  }

  @UseGuards(AdminGqlAuthGuard)
  @Mutation(() => Boolean)
  async deletePromotionCode(@UserEntity() user: User, @Args('data') data: DeletePromotionInput): Promise<boolean> {
    await this.promotionService.deletePromotion(user, data.promotionId);

    return true;
  }

  @UseGuards(AdminGqlAuthGuard)
  @Query(() => [Promotion])
  async getPromotionCodes(@UserEntity() user: User): Promise<Promotion[]> {
    return this.promotionService.getPromotionCodes(user);
  }
}
