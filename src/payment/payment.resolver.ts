import { NotAcceptableException, UseGuards } from '@nestjs/common';
import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import GraphQLUpload from 'graphql-upload/GraphQLUpload.js';
import Upload from 'graphql-upload/Upload.js';
import { PrismaService } from 'nestjs-prisma';

import { Domain } from '../arvan/models/domain.model';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { UserEntity } from '../common/decorators/user.decorator';
import { User } from '../users/models/user.model';
import { BuyRechargePackageInput } from './dto/buyRechargePackage.input';
import { PaymentRequestInput } from './dto/paymentRequest.input';
import { RechargePackage } from './models/rechargePackage.model';
import { PaymentService } from './payment.service';

@Resolver()
@UseGuards(GqlAuthGuard)
export class PaymentResolver {
  constructor(private paymentService: PaymentService, private prisma: PrismaService) {}

  private defaultServerId: string;

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
}
