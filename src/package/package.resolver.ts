import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { PrismaService } from 'nestjs-prisma';

import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { UserEntity } from '../common/decorators/user.decorator';
import { getVlessLink } from '../common/helpers';
import { User } from '../users/models/user.model';
import { BuyPackageInput } from './dto/buyPackage.input';
import { GetPackageInput } from './dto/get-packages.input';
import { UserPackageOutput } from './dto/get-user-packages.output';
import { RenewPackageInput } from './dto/renewPackage.input';
import { Package } from './models/package.model';
import { PackageService } from './package.service';

@Resolver()
export class PackageResolver {
  constructor(private packageService: PackageService, private prisma: PrismaService) {}

  @UseGuards(GqlAuthGuard)
  @Query(() => [Package])
  packages(@UserEntity() user: User, @Args('data') data: GetPackageInput): Promise<Package[]> {
    return this.packageService.getPackages(user, data);
  }

  @UseGuards(GqlAuthGuard)
  @Query(() => [UserPackageOutput])
  userPackages(@UserEntity() user: User): Promise<UserPackageOutput[]> {
    return this.packageService.getUserPackages(user);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => String)
  async buyPackage(@UserEntity() user: User, @Args('data') data: BuyPackageInput): Promise<string> {
    const userPack = await this.packageService.buyPackage(user, data);
    const server = await this.prisma.server.findUniqueOrThrow({
      where: { id: userPack.serverId },
      include: { brand: true },
    });

    return getVlessLink(
      userPack.statId,
      server.tunnelDomain,
      `${userPack.name} | ${server.brand?.domainName as string}`,
      server.port,
    );
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Boolean)
  async enableGift(@UserEntity() user: User) {
    await this.packageService.enableGift(user.id);

    return true;
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => UserPackageOutput, { nullable: true })
  async enableTodayFreePackage(@UserEntity() user: User): Promise<UserPackageOutput | null> {
    const currentFreePack = await this.packageService.getCurrentFreePackage(user);

    if (currentFreePack && currentFreePack.remainingTraffic > 0) {
      return currentFreePack;
    }

    if (currentFreePack && currentFreePack.remainingTraffic <= 0) {
      return null;
    }

    await this.packageService.enableTodayFreePackage(user);

    return this.packageService.getCurrentFreePackage(user);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => String)
  async renewPackage(@UserEntity() user: User, @Args('input') input: RenewPackageInput): Promise<string> {
    const userPack = await this.packageService.renewPackage(user, input);
    const server = await this.prisma.server.findUniqueOrThrow({
      where: { id: userPack.serverId },
      include: { brand: true },
    });

    return getVlessLink(
      userPack.statId,
      server.tunnelDomain,
      `${userPack.name} | ${server.brand?.domainName as string}`,
      server.port,
    );
  }
}
