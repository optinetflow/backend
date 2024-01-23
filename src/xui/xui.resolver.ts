import { NotAcceptableException, UseGuards } from '@nestjs/common';
import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { PrismaService } from 'nestjs-prisma';

import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { UserEntity } from '../common/decorators/user.decorator';
import { getVlessLink } from '../common/helpers';
import { User } from '../users/models/user.model';
import { BuyPackageInput } from './dto/buyPackage.input';
import { GetClientStatsFiltersInput } from './dto/getClientStatsFilters.input';
import { RenewPackageInput } from './dto/renewPackage.input';
import { ClientStat } from './models/clientStat.model';
import { Package } from './models/package.model';
import { UserPackage } from './models/userPackage.model';
import { XuiService } from './xui.service';

@Resolver()
export class XuiResolver {
  constructor(private xuiService: XuiService, private prisma: PrismaService) {}

  // @UseGuards(GqlAuthGuard)
  @Query(() => [ClientStat])
  clientStats(@Args('filters', { nullable: true }) filter?: GetClientStatsFiltersInput): Promise<ClientStat[]> {
    return this.xuiService.getClientStats(filter);
  }

  @UseGuards(GqlAuthGuard)
  @Query(() => [Package])
  packages(@UserEntity() user: User): Promise<Package[]> {
    return this.xuiService.getPackages(user);
  }

  @UseGuards(GqlAuthGuard)
  @Query(() => [UserPackage])
  userPackages(@UserEntity() user: User): Promise<UserPackage[]> {
    return this.xuiService.getUserPackages(user);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => String)
  async buyPackage(@UserEntity() user: User, @Args('data') data: BuyPackageInput): Promise<string> {
    const userPack = await this.xuiService.buyPackage(user, data);

    return getVlessLink(userPack.statId, userPack.serverId, userPack.name);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => String)
  async renewPackage(@UserEntity() user: User, @Args('input') input: RenewPackageInput): Promise<string> {
    const userPack = await this.xuiService.renewPackage(user, input);

    return getVlessLink(userPack.statId, userPack.serverId, userPack.name);
  }
}
