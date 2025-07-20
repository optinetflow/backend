import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { PrismaService } from 'nestjs-prisma';

import { AdminGqlAuthGuard, GqlAuthGuard } from '../auth/gql-auth.guard';
import { UserEntity } from '../common/decorators/user.decorator';
import { getConfigLink } from '../common/helpers';
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

  @UseGuards(AdminGqlAuthGuard)
  @Query(() => [Package])
  async getGiftPackages(): Promise<Package[]> {
    return this.packageService.getGiftPackages();
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => [String])
  async buyPackage(@UserEntity() user: User, @Args('data') data: BuyPackageInput): Promise<string[]> {
    const userPacks = await this.packageService.buyPackage(user, data);
    const server = await this.prisma.server.findUniqueOrThrow({
      where: { id: userPacks[0].serverId },
    });

    const brand = await this.prisma.brand.findUniqueOrThrow({
      where: { id: user.brandId },
    });

    return userPacks.map((pack) =>
      getConfigLink({
        id: pack.statId,
        name: `${pack.name} | ${brand.domainName}`,
        port: server.port,
        tunnelDomain: server.tunnelDomain,
        inboundType: server.inboundType,
      }),
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

    const brand = await this.prisma.brand.findUniqueOrThrow({
      where: { id: user.brandId },
    });

    if (currentFreePack && !currentFreePack.finishedAt) {
      return this.packageService.generateUserPackageOutput(currentFreePack, brand.domainName);
    }

    const oneDaysAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

    if (!currentFreePack || currentFreePack?.createdAt.getTime() < oneDaysAgo.getTime()) {
      await this.packageService.enableTodayFreePackage(user);

      const newCurrentFreePackage = await this.packageService.getCurrentFreePackage(user);

      return newCurrentFreePackage
        ? this.packageService.generateUserPackageOutput(newCurrentFreePackage, brand.domainName)
        : null;
    }

    return null;
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => String)
  async renewPackage(@UserEntity() user: User, @Args('input') input: RenewPackageInput): Promise<string> {
    const userPack = await this.packageService.renewPackage(user, input);
    const server = await this.prisma.server.findUniqueOrThrow({
      where: { id: userPack.serverId },
    });

    const brand = await this.prisma.brand.findUniqueOrThrow({
      where: { id: user.brandId },
    });

    return getConfigLink({
      id: userPack.statId,
      name: `${userPack.name} | ${brand.domainName}`,
      port: server.port,
      tunnelDomain: server.tunnelDomain,
      inboundType: server.inboundType,
    });
  }
}
