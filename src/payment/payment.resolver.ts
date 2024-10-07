import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { PrismaService } from 'nestjs-prisma';

import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { UserEntity } from '../common/decorators/user.decorator';
import { User } from '../users/models/user.model';
import { BuyRechargePackageInput } from './dto/buyRechargePackage.input';
import { EnterCostInput } from './dto/enterCost.input';
import { RechargePackage } from './models/rechargePackage.model';
import { PaymentService } from './payment.service.c';

@Resolver()
@UseGuards(GqlAuthGuard)
export class PaymentResolver {
  constructor(private paymentService: PaymentService) {}

  @UseGuards(GqlAuthGuard)
  @Query(() => [RechargePackage])
  rechargePackages(@UserEntity() user: User): Promise<RechargePackage[]> {
    return this.paymentService.getRechargePackages(user);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => User)
  buyRechargePackage(@UserEntity() user: User, @Args('input') input: BuyRechargePackageInput): Promise<User> {
    return this.paymentService.buyRechargePackage(user, input);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => User)
  enterCost(@UserEntity() user: User, @Args('input') input: EnterCostInput): Promise<User> {
    return this.paymentService.enterCost(user, input);
  }
}
