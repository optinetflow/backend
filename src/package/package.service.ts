/* eslint-disable max-len */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import moment from 'jalali-moment';
import { customAlphabet } from 'nanoid';
import { v4 as uuid } from 'uuid';

import { GraphqlConfig } from '../common/configs/config.interface';
import { arrayToDic, bytesToGB, ceilIfNeeded, getConfigLink, pctToDec } from '../common/helpers';
import { I18nService } from '../common/i18/i18.service';
import { ClientManagementService } from '../common/services/client-management.service';
import { ServerManagementService } from '../common/services/server-management.service';
import {
  Country,
  Package,
  PackageCategory,
  Prisma,
  Role,
  Server,
  UserPackage as UserPackagePrisma,
} from '../generated/prisma/client';
import { PaymentService } from '../payment/payment.service';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '../users/models/user.model';
import { XuiService } from '../xui/xui.service';
import { TelegramService } from './../telegram/telegram.service';
import { BuyPackageInput } from './dto/buyPackage.input';
import { GetPackageInput } from './dto/get-packages.input';
import { UserPackageOutput } from './dto/get-user-packages.output';
import { RenewPackageInput } from './dto/renewPackage.input';
import { UserPackage } from './models/userPackage.model';
import { bundleGroupSizes, longTermPackages } from './package.constant';
import { CreatePackageInput } from './package.types';

interface PackageWithDiscount extends Package {
  discountedPrice?: number;
  categoryFa?: string;
  bundleGroupSize?: number;
}

interface ClientData {
  userPackageId: string;
  id: string;
  subId: string;
  email: string;
  serverId: string;
  package: Package;
  name: string;
}

interface PackageTransactionData {
  user: User;
  clients: ClientData[];
  pack: Package;
  server: Server;
  receipt?: string;
  isRenewal: boolean;
  userPackageName: string;
  bundleGroupSize?: number;
  bundleGroupKey?: string;
  orderN?: number;
  isFree?: boolean;
  isGift?: boolean;
  durationMonths?: number;
  additionalTransactions?: Array<Prisma.PrismaPromise<unknown>>;
}

interface ValidateUserBalanceInput {
  user: User;
  packagePrice: number;
  parent?: User;
  bundleGroupSize?: number;
  durationMonths?: number;
}

@Injectable()
export class PackageService {
  private readonly nanoidGenerator = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);

  private readonly logger = new Logger(PackageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
    private readonly xuiService: XuiService,
    private readonly payment: PaymentService,
    private readonly configService: ConfigService,
    private readonly i18: I18nService,
    private readonly serverManagementService: ServerManagementService,
    private readonly clientManagementService: ClientManagementService,
  ) {}

  private isDevelopment(): boolean {
    return this.configService.get('env') === 'development';
  }

  private isDebugMode(): boolean {
    const graphqlConfig = this.configService.get<GraphqlConfig>('graphql');

    return Boolean(graphqlConfig?.debug);
  }

  private ensureUserNotBlocked(user: User): void {
    const isBlocked = Boolean(user.isDisabled || user.isParentDisabled);

    if (isBlocked) {
      throw new BadRequestException('Your account is blocked!');
    }
  }

  private ensureAdminBalanceSufficient(user: User, cost: number): void {
    if (user.role === Role.ADMIN && cost > user.balance) {
      throw new BadRequestException(this.i18.__('user.balance.not_enough'));
    }
  }

  private computeDiscountedPrice({
    user,
    packagePrice,
    parent,
    bundleGroupSize,
    durationMonths,
  }: ValidateUserBalanceInput): number {
    let discountedPrice = packagePrice;

    if (parent) {
      const maxUserDiscount = (parent.profitPercent / (100 + parent.profitPercent)) * 100;
      const maxBundleDiscount = parent.maxGroupDiscount || maxUserDiscount;

      if (bundleGroupSize) {
        const bundlePrice = packagePrice * bundleGroupSize;
        const discount = bundleGroupSizes.find((size) => size.bundleGroupSize === bundleGroupSize)?.discount;

        if (!discount) {
          throw new BadRequestException('In validateUserBalance Discount not found!');
        }

        discountedPrice = ceilIfNeeded(bundlePrice * (1 - discount * pctToDec(maxBundleDiscount)), 0);
      }

      if (durationMonths) {
        const durationPrice = packagePrice * durationMonths;
        const discount = longTermPackages.find((pack) => pack.durationMonths === durationMonths)?.discount;

        if (!discount) {
          throw new BadRequestException('In validateUserBalance Discount not found!');
        }

        discountedPrice = ceilIfNeeded(durationPrice * (1 - discount * pctToDec(maxBundleDiscount)), 0);
      }
    } else {
      discountedPrice = packagePrice * (1 - pctToDec(user.appliedDiscountPercent));
    }

    return discountedPrice;
  }

  private validateUserBalance({
    user,
    packagePrice,
    parent,
    bundleGroupSize,
    durationMonths,
  }: ValidateUserBalanceInput): void {
    this.ensureUserNotBlocked(user);
    const discountedPrice = this.computeDiscountedPrice({
      user,
      packagePrice,
      parent,
      bundleGroupSize,
      durationMonths,
    });
    this.ensureAdminBalanceSufficient(user, discountedPrice);
  }

  private async getLastUserPackageOrder(userId: string): Promise<number> {
    const lastUserPack = await this.prisma.userPackage.findFirst({
      where: { userId },
      orderBy: { orderN: 'desc' },
    });

    return (lastUserPack?.orderN || 0) + 1;
  }

  private createSingleClientData(pack: Package, server: Server, name: string): Omit<ClientData, 'userPackageId'> {
    return {
      id: uuid(),
      subId: this.nanoidGenerator(),
      email: this.nanoidGenerator(),
      serverId: server.id,
      package: pack,
      name,
    };
  }

  private calculateRenewalPackage(
    userPack: UserPackagePrisma & {
      stat: { expiryTime: bigint; total: bigint; down: bigint; up: bigint };
      package: { traffic: number; expirationDays: number };
    },
    newPack: Package,
  ): Package {
    const modifiedPack = { ...newPack };

    if (!userPack.finishedAt) {
      const expiryTime = Number(userPack.stat.expiryTime);
      const remainingDays = (expiryTime > 0 ? expiryTime - Date.now() : -Number(expiryTime)) / (1000 * 60 * 60 * 24);
      const remainingTraffic = bytesToGB(Number(userPack.stat.total - (userPack.stat.down + userPack.stat.up)));

      const maxTransformableExpirationDays =
        (remainingTraffic / userPack.package.traffic) * userPack.package.expirationDays;
      const maxTransformableTraffic = (remainingDays / userPack.package.expirationDays) * userPack.package.traffic;

      modifiedPack.traffic += remainingTraffic > maxTransformableTraffic ? maxTransformableTraffic : remainingTraffic;
      modifiedPack.expirationDays +=
        remainingDays > maxTransformableExpirationDays ? maxTransformableExpirationDays : remainingDays;
    }

    return modifiedPack;
  }

  private createRenewalClients(
    userPack: UserPackagePrisma & {
      stat: { subId: string; email: string };
      server: { id: string };
      name: string;
      statId: string;
    },
    modifiedPack: Package,
    userPackageId: string,
  ): ClientData[] {
    return [
      {
        userPackageId,
        id: userPack.statId,
        subId: userPack.stat.subId,
        email: userPack.stat.email,
        serverId: userPack.server.id,
        package: modifiedPack,
        name: userPack.name,
      },
    ];
  }

  private applyParentPricing(packages: PackageWithDiscount[], parent: User | null): PackageWithDiscount[] {
    if (!parent || (typeof parent.appliedDiscountPercent !== 'number' && typeof parent.profitPercent !== 'number')) {
      return packages;
    }

    return packages.map((pack) => {
      const parentDiscount = pctToDec(parent.appliedDiscountPercent);
      const parentProfit = pctToDec(parent.profitPercent);
      const adjustedPrice = ceilIfNeeded(pack.price * ((1 - parentDiscount) * (1 + parentProfit)), 0);

      return { ...pack, price: adjustedPrice };
    });
  }

  private applyUserDiscount(
    packages: PackageWithDiscount[],
    user: User,
    originalPackages: PackageWithDiscount[],
  ): PackageWithDiscount[] {
    if (typeof user.appliedDiscountPercent !== 'number') {
      return packages;
    }

    const originalPackagesMap = arrayToDic(originalPackages);

    return packages.map((pack) => {
      const discountedPrice = ceilIfNeeded(
        originalPackagesMap[pack.id].price * (1 - pctToDec(user.appliedDiscountPercent)),
        0,
      );

      return {
        ...pack,
        discountedPrice: discountedPrice !== pack.price ? discountedPrice : undefined,
      };
    });
  }

  private async getFreeServer(user: User, pack: Package, country: Country): Promise<Server> {
    return this.serverManagementService.getFreeServer(user, pack, country);
  }

  async buyPackage(user: User, input: BuyPackageInput): Promise<UserPackagePrisma[]> {
    const basePackage = await this.prisma.package.findUniqueOrThrow({
      where: { id: input.packageId },
    });
    const parent = user.parentId
      ? (await this.prisma.user.findUnique({ where: { id: user.parentId } })) || undefined
      : undefined;

    const pack = {
      ...basePackage,
      expirationDays: input.durationMonths ? input.durationMonths * 30 : basePackage.expirationDays,
      traffic: input.durationMonths ? input.durationMonths * basePackage.traffic : basePackage.traffic,
    };

    this.validateUserBalance({
      user,
      packagePrice: pack.price,
      durationMonths: input.durationMonths,
      bundleGroupSize: input.bundleGroupSize,
      parent,
    });

    const bundleGroupKey = input.bundleGroupSize ? this.nanoidGenerator() : undefined;
    const server = await this.getFreeServer(user, pack, input.country);
    const userPackageName = input.name || 'No Name';

    const clients = await this.createClientsForPurchase({
      user,
      pack,
      server,
      bundleGroupSize: input.bundleGroupSize,
      userPackageName,
      durationMonths: input.durationMonths,
    });

    const baseOrderN = await this.getLastUserPackageOrder(user.id);
    const orderN = baseOrderN + ((input.bundleGroupSize || 1) - 1);

    await this.executePackageTransaction({
      user,
      clients,
      pack,
      server,
      receipt: input.receipt,
      isRenewal: false,
      userPackageName,
      bundleGroupSize: input.bundleGroupSize,
      bundleGroupKey,
      orderN,
      durationMonths: input.durationMonths,
    });

    return bundleGroupKey
      ? this.prisma.userPackage.findMany({ where: { bundleGroupKey } })
      : this.prisma.userPackage.findMany({ where: { id: clients[0].userPackageId } });
  }

  private async createClientsForPurchase({
    user,
    pack,
    server,
    bundleGroupSize,
    userPackageName,
  }: {
    user: User;
    pack: Package;
    server: Server;
    bundleGroupSize?: number;
    userPackageName: string;
    durationMonths?: number;
  }): Promise<ClientData[]> {
    const clients: ClientData[] = [];
    const size = bundleGroupSize || 1;

    for (let i = 0; i < size; i++) {
      const email = this.nanoidGenerator();
      const id = uuid();
      const subId = this.nanoidGenerator();
      const userPackageId = uuid();

      clients.push({
        id,
        subId,
        email,
        serverId: server.id,
        package: pack,
        name: bundleGroupSize ? `${userPackageName} ${i + 1}` : userPackageName,
        userPackageId,
      });
    }

    if (!this.isDevelopment()) {
      await this.clientManagementService.addClient(user, clients);
    }

    return clients;
  }

  async getCurrentFreePackage(user: User): Promise<UserPackagePrisma | null> {
    return this.prisma.userPackage.findFirst({
      where: {
        userId: user.id,
        isFree: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        stat: true,
        server: true,
        package: true,
      },
    });
  }

  async enableTodayFreePackage(user: User): Promise<void> {
    // const parent = await this.prisma.user.findUniqueOrThrow({ where: { id: user.parent?.id } });

    // if (!parent.freePackageId) {
    //   throw new BadRequestException('There is no free package');
    // }

    const pack = await this.prisma.package.findUniqueOrThrow({ where: { id: '3300192a-df03-4fa2-9740-291850122cc3' } });
    const server = await this.getFreeServer(user, pack, Country.un);
    const userPackageName = `رایگان ${moment().locale('fa').format('dddd')}`;

    const clientData = this.createSingleClientData(pack, server, userPackageName);

    if (!this.isDebugMode()) {
      await this.clientManagementService.addClient(user, [clientData]);
    }

    const orderN = await this.getLastUserPackageOrder(user.id);
    const clients = [{ ...clientData, userPackageId: uuid() }];

    await this.executePackageTransaction({
      user,
      clients,
      pack,
      server,
      isRenewal: false,
      userPackageName,
      orderN,
      isFree: true,
    });
  }

  async enableGift(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: userId },
      include: { brand: true, userGift: { include: { giftPackage: true }, where: { isGiftUsed: false } } },
    });

    const userGift = user?.userGift?.[0];
    const gift = await this.prisma.userGift.findUniqueOrThrow({ where: { id: userGift.id } });
    const pack = await this.prisma.package.findUniqueOrThrow({ where: { id: gift.giftPackageId! } });
    const server = await this.getFreeServer(user, pack, Country.de);
    const userPackageName = 'هدیه 🎁';

    const clientData = this.createSingleClientData(pack, server, userPackageName);

    if (!this.isDebugMode()) {
      await this.clientManagementService.addClient(user, [clientData]);
    }

    const orderN = await this.getLastUserPackageOrder(user.id);
    const clients = [{ ...clientData, userPackageId: uuid() }];
    const additionalTransactions = [
      this.prisma.userGift.update({ where: { id: gift.id }, data: { isGiftUsed: true } }),
    ];

    await this.executePackageTransaction({
      user,
      clients,
      pack,
      server,
      isRenewal: false,
      userPackageName,
      orderN,
      isFree: false,
      isGift: true,
      additionalTransactions,
    });
  }

  private async executePackageTransaction(input: PackageTransactionData): Promise<void> {
    const {
      user,
      clients,
      pack,
      server,
      receipt,
      isRenewal,
      userPackageName,
      bundleGroupSize,
      bundleGroupKey,
      orderN,
      isFree,
      isGift,
      additionalTransactions,
      durationMonths,
    } = input;

    try {
      const [financeTransactions, telegramMessages] = await this.payment.purchasePackagePayment(user, {
        userPackageId: clients[0].userPackageId,
        package: pack,
        receipt,
        inRenew: isRenewal,
        userPackageName,
        server,
        bundleGroupSize,
        isFree,
        isGift,
        durationMonths,
        country: server.country,
      });

      const createPackageTransactions: Array<Prisma.PrismaPromise<unknown>> = [];

      for (const client of clients) {
        const clientOrderN = orderN ? orderN - clients.indexOf(client) : 1;
        createPackageTransactions.push(
          ...this.createPackage(user, {
            id: client.id,
            userPackageId: client.userPackageId,
            subId: client.subId,
            email: client.email,
            server,
            name: client.name,
            package: client.package,
            orderN: clientOrderN,
            bundleGroupSize,
            bundleGroupKey,
            isFree,
            durationMonths,
          }),
        );
      }

      const allTransactions = [...createPackageTransactions, ...financeTransactions, ...(additionalTransactions || [])];

      await this.prisma.$transaction(allTransactions);
      await this.telegramService.sendBulkMessage(telegramMessages);
    } catch (error) {
      this.logger.error('Package transaction failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId: user.id,
        packageId: pack.id,
        packageTraffic: pack.traffic,
        packageExpirationDays: pack.expirationDays,
        serverId: server.id,
        serverDomain: server.domain,
        isRenewal,
        isFree,
        isGift,
        clientCount: clients.length,
        userPackageName,
        bundleGroupSize,
        receipt,
      });

      // Bulk delete clients from stats if transaction fails
      const clientStatIds = clients.map((client) => client.id);

      try {
        await this.xuiService.bulkDeleteClients(clientStatIds, server);
      } catch (cleanupError) {
        this.logger.error('Failed to cleanup clients after transaction failure', {
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          clientStatIds,
          serverId: server.id,
        });
      }

      throw new BadRequestException('Transaction failed');
    }
  }

  async renewPackage(user: User, input: RenewPackageInput): Promise<UserPackagePrisma> {
    const userPackageId = uuid();
    const isDev = this.isDevelopment();
    const userPack = await this.prisma.userPackage.findUniqueOrThrow({
      where: { id: input.userPackageId },
      include: { server: true, stat: true, package: true },
    });
    const basePackage = await this.prisma.package.findUniqueOrThrow({ where: { id: input.packageId } });
    const parent = user.parentId
      ? (await this.prisma.user.findUnique({ where: { id: user.parentId } })) || undefined
      : undefined;

    // Apply duration months if provided
    const pack = {
      ...basePackage,
      expirationDays: input.durationMonths ? input.durationMonths * 30 : basePackage.expirationDays,
      traffic: input.durationMonths ? input.durationMonths * basePackage.traffic : basePackage.traffic,
    };

    this.validateUserBalance({
      user,
      packagePrice: pack.price,
      durationMonths: input.durationMonths,
      parent,
    });

    const modifiedPack = this.calculateRenewalPackage(userPack, pack);
    const clients = this.createRenewalClients(userPack, modifiedPack, userPackageId);
    const additionalTransactions = [
      this.prisma.userPackage.update({
        where: { id: userPack.id },
        data: { deletedAt: new Date() },
      }),
    ];

    try {
      if (!isDev) {
        if (!userPack.finishedAt) {
          await this.xuiService.resetClientTraffic(userPack.statId);
          await this.xuiService.updateClient(user, {
            id: userPack.statId,
            email: userPack.stat.email,
            subId: userPack.stat.subId,
            name: userPack.name,
            orderN: userPack.orderN,
            package: modifiedPack,
            server: userPack.server,
            enable: userPack.stat.enable,
          });
        } else {
          await this.clientManagementService.addClient(user, [
            {
              id: userPack.statId,
              subId: userPack.stat.subId,
              email: userPack.stat.email,
              serverId: userPack.server.id,
              package: modifiedPack,
              name: userPack.name,
              orderN: userPack.orderN,
            },
          ]);
        }
      }

      await this.executePackageTransaction({
        user,
        clients,
        pack,
        server: userPack.server,
        receipt: input.receipt,
        isRenewal: true,
        userPackageName: userPack.name,
        orderN: userPack.orderN,
        durationMonths: input.durationMonths,
        additionalTransactions,
      });

      return await this.prisma.userPackage.findFirstOrThrow({ where: { id: userPackageId } });
    } catch {
      throw new BadRequestException('Renewal failed');
    }
  }

  generateUserPackageOutput(userPack: UserPackage | UserPackagePrisma, brandName: string): UserPackageOutput {
    const userPackage = userPack as UserPackage;

    return {
      id: userPackage.id,
      createdAt: userPackage.createdAt,
      updatedAt: userPackage.updatedAt,
      name: userPackage.name,
      category: userPackage.package.category,
      categoryFa: this.i18.__(`package.category.${userPackage.package.category}`),
      link: getConfigLink({
        id: userPack.statId,
        name: `${userPack.name} | ${brandName}`,
        port: userPackage.server.port,
        tunnelDomain: userPackage.server.tunnelDomain,
        inboundType: userPackage.server.inboundType,
      }),
      remainingTraffic: userPackage.stat.total - (userPackage.stat.down + userPackage.stat.up),
      totalTraffic: userPackage.stat.total,
      expiryTime: userPackage.stat.expiryTime,
      lastConnectedAt: userPackage.stat?.lastConnectedAt,
      isFree: userPackage.isFree,
      bundleGroupSize: userPackage.bundleGroupSize,
      country: userPackage.server.country,
    };
  }

  async getGiftPackages(): Promise<Package[]> {
    return this.prisma.package.findMany({ where: { category: PackageCategory.QUALITY, traffic: { lt: 10 } } });
  }

  async getUserPackages(user: User): Promise<UserPackageOutput[]> {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const userPacks = await this.prisma.userPackage.findMany({
      include: {
        stat: true,
        server: true,
        package: {
          select: {
            category: true,
          },
        },
      },
      where: {
        userId: user.id,
        isFree: false,
        deletedAt: null,
        OR: [{ finishedAt: null }, { finishedAt: { gte: threeDaysAgo } }],
      },
      orderBy: {
        orderN: 'desc',
      },
    });

    const brand = await this.prisma.brand.findUniqueOrThrow({
      where: { id: user.brandId },
    });

    return userPacks.map((userPack) => this.generateUserPackageOutput(userPack, brand.domainName));
  }

  createPackage(user: User, input: CreatePackageInput): Array<Prisma.PrismaPromise<unknown>> {
    return this.clientManagementService.createPackage(user, input);
  }

  private addBundlePackages(packages: PackageWithDiscount[], parent: User): PackageWithDiscount[] {
    const bundlePackages: PackageWithDiscount[] = [];
    const maxUserDiscount = (parent.profitPercent / (100 + parent.profitPercent)) * 100;
    const maxBundleDiscount = parent.maxGroupDiscount || maxUserDiscount;
    const eligiblePackages = packages.filter((pack) => pack.traffic === 30 && pack.expirationDays === 30);

    for (const pack of eligiblePackages) {
      bundleGroupSizes.forEach(({ bundleGroupSize, discount }) => {
        const bundlePrice = pack.price * bundleGroupSize;
        const bundlePackage = {
          ...pack,
          id: `${pack.id}-g${bundleGroupSize}`,
          price: bundlePrice,
          bundleGroupSize,
          discountedPrice: ceilIfNeeded(bundlePrice * (1 - discount * pctToDec(maxBundleDiscount)), 0),
        };
        bundlePackages.push(bundlePackage);
      });
    }

    return [...packages, ...bundlePackages];
  }

  private addLongTermPackages(packages: PackageWithDiscount[], parent: User): PackageWithDiscount[] {
    const longPackages: PackageWithDiscount[] = [];
    const maxUserDiscount = (parent.profitPercent / (100 + parent.profitPercent)) * 100;
    const maxBundleDiscount = parent.maxGroupDiscount || maxUserDiscount;
    const eligiblePackages = packages.filter((pack) => pack.expirationDays === 30 && !pack.bundleGroupSize);

    for (const pack of eligiblePackages) {
      longTermPackages.forEach(({ durationMonths, discount }) => {
        const durationPrice = pack.price * durationMonths;
        const traffic = pack.traffic * durationMonths;
        const expirationDays = pack.expirationDays * durationMonths;
        const bundlePackage = {
          ...pack,
          id: `${pack.id}-m${durationMonths}`,
          price: durationPrice,
          traffic,
          expirationDays,
          discountedPrice: ceilIfNeeded(durationPrice * (1 - discount * pctToDec(maxBundleDiscount)), 0),
        };

        // const isValidFor3 = durationMonths === 3 && traffic < 200 && traffic > 50;
        // const isValidFor6 = durationMonths === 6 && traffic < 400 && traffic > 100;
        // const isValidFor9 = durationMonths === 9 && traffic < 500 && traffic > 150;
        // const isValid = isValidFor3 || isValidFor6 || isValidFor9;
        const isValid = true;

        if (isValid) {
          longPackages.push(bundlePackage);
        }
      });
    }

    return [...packages, ...longPackages];
  }

  async getPackages(user: User, filters: GetPackageInput, id?: string): Promise<PackageWithDiscount[]> {
    const { category, expirationDays } = filters;
    const packages = await this.prisma.package.findMany({
      where: {
        deletedAt: null,
        forRole: { has: user.role },
        id,
        category: category || undefined,
        expirationDays: expirationDays && expirationDays > 0 ? expirationDays : undefined,
      },
      orderBy: { order: 'asc' },
    });

    const packagesWithTranslation = packages.map((pack) => ({
      ...pack,
      categoryFa: this.i18.__(`package.category.${pack.category}`),
    }));

    const parent = user?.parentId ? await this.prisma.user.findUnique({ where: { id: user.parentId } }) : null;
    const packagesWithParentPricing = this.applyParentPricing(packagesWithTranslation, parent);
    const packagesWithUserDiscount = this.applyUserDiscount(packagesWithParentPricing, user, packagesWithTranslation);
    const packagesWithBundle = parent
      ? this.addBundlePackages(packagesWithUserDiscount, parent)
      : packagesWithUserDiscount;

    return parent ? this.addLongTermPackages(packagesWithBundle, parent) : packagesWithBundle;
  }
}
