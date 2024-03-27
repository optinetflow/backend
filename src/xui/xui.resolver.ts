import { UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
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
  constructor(
    private xuiService: XuiService,
    private readonly configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  private readonly webPanel = this.configService.get('webPanelUrl');

  // @UseGuards(GqlAuthGuard)
  @Query(() => [ClientStat])
  clientStats(@Args('filters') filter: GetClientStatsFiltersInput): Promise<ClientStat[]> {
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
    const server = await this.prisma.server.findUniqueOrThrow({ where: { id: userPack.serverId } });

    return getVlessLink(userPack.statId, server.domain, `${userPack.name} | ${new URL(this.webPanel).hostname}`);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => String)
  async renewPackage(@UserEntity() user: User, @Args('input') input: RenewPackageInput): Promise<string> {
    const userPack = await this.xuiService.renewPackage(user, input);
    const server = await this.prisma.server.findUniqueOrThrow({ where: { id: userPack.serverId } });

    return getVlessLink(userPack.statId, server.domain, `${userPack.name} | ${new URL(this.webPanel).hostname}`);
  }
}
