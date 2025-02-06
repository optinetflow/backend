/* eslint-disable max-len */
import { BadRequestException, Injectable, NotAcceptableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Package, PackageCategory, Prisma, Role, Server, UserPackage as UserPackagePrisma } from '@prisma/client';
import moment from 'jalali-moment';
import { customAlphabet } from 'nanoid';
import { PrismaService } from 'nestjs-prisma';
import { v4 as uuid } from 'uuid';

import { GraphqlConfig } from '../common/configs/config.interface';
import { arrayToDic, bytesToGB, ceilIfNeeded, getVlessLink, pctToDec, roundTo } from '../common/helpers';
import { I18nService } from '../common/i18/i18.service';
import { PaymentService } from '../payment/payment.service';
import { User } from '../users/models/user.model';
import { XuiService } from '../xui/xui.service';
import { TelegramService } from './../telegram/telegram.service';
import { BuyPackageInput } from './dto/buyPackage.input';
import { GetPackageInput } from './dto/get-packages.input';
import { UserPackageOutput } from './dto/get-user-packages.output';
import { RenewPackageInput } from './dto/renewPackage.input';
import { UserPackage } from './models/userPackage.model';
import { CreatePackageInput } from './package.types';

interface DiscountedPackage extends Package {
  discountedPrice?: number;
  categoryFa?: string;
}

@Injectable()
export class PackageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
    private readonly xuiService: XuiService,
    private readonly payment: PaymentService,
    private readonly configService: ConfigService,
    private readonly i18: I18nService,
  ) {}

  async getFreeServer(user: User, pack: Package): Promise<Server> {
    if (!user.brandId) {
      throw new NotAcceptableException('Brand is not found for this user');
    }

    const activeServer = await this.prisma.activeServer.findUnique({
      where: {
        BrandCategoryUnique: {
          brandId: user.brandId,
          category: pack.category,
        },
      },
      include: {
        server: true,
      },
    });

    if (!activeServer?.server) {
      throw new NotAcceptableException(
        `No active server found for brand ${user.brandId} and category ${pack.category}`,
      );
    }

    return activeServer.server;
  }

  async buyPackage(user: User, input: BuyPackageInput): Promise<UserPackagePrisma> {
    const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);
    const isBlocked = Boolean(user.isDisabled || user.isParentDisabled);

    if (isBlocked) {
      throw new BadRequestException('Your account is blocked!');
    }

    const pack = await this.prisma.package.findUniqueOrThrow({
      where: {
        id: input.packageId,
      },
    });
    const role = user.role;
    const discountedPrice = pack.price * (1 - pctToDec(user.appliedDiscountPercent));

    if (role === Role.ADMIN && (discountedPrice < 0 || discountedPrice > user.balance)) {
      throw new BadRequestException(this.i18.__('user.balance.not_enough'));
    }

    const server = await this.getFreeServer(user, pack);
    const email = nanoid();
    const id = uuid();
    const subId = nanoid();
    const userPackageId = uuid();
    const userPackageName = input.name || 'No Name';
    const isDev = this.configService.get('env') === 'development';

    // to make up for lose user
    // const isOldUser = new Date(user.createdAt) < new Date('2025-01-29');
    // pack.traffic = pack.traffic * (isOldUser ? 1.2 : 1);

    if (!isDev) {
      await this.xuiService.addClient(user, {
        id,
        subId,
        email,
        serverId: server.id,
        package: pack,
        name: input.name || 'No Name',
      });
    }

    const [financeTransactions, telegramMessages] = await this.payment.purchasePackagePayment(user, {
      userPackageId,
      package: pack,
      receipt: input.receipt,
      inRenew: false,
      userPackageName,
    });

    const lastUserPack = await this.prisma.userPackage.findFirst({
      where: { userId: user.id },
      orderBy: { orderN: 'desc' },
    });

    const createPackageTransactions = this.createPackage(user, {
      id,
      userPackageId,
      subId,
      email,
      server,
      name: userPackageName,
      package: pack,
      orderN: (lastUserPack?.orderN || 0) + 1,
    });
    await this.prisma.$transaction([...createPackageTransactions, ...financeTransactions]);
    await this.telegramService.sendBulkMessage(telegramMessages);

    return this.prisma.userPackage.findFirstOrThrow({ where: { id: userPackageId } });
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
        server: {
          include: {
            brand: true,
          },
        },
        package: true,
      },
    });
  }

  async enableTodayFreePackage(user: User) {
    const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);
    const parent = await this.prisma.user.findUniqueOrThrow({ where: { id: user.parent?.id } });

    if (!parent.freePackageId) {
      throw new BadRequestException('There is no free package');
    }

    const pack = await this.prisma.package.findUniqueOrThrow({ where: { id: parent.freePackageId } });
    const server = await this.getFreeServer(user, pack);
    const email = nanoid();
    const id = uuid();
    const subId = nanoid();
    const userPackageId = uuid();
    const userPackageName = `رایگان ${moment().locale('fa').format('dddd')}`;
    const graphqlConfig = this.configService.get<GraphqlConfig>('graphql');

    if (!graphqlConfig?.debug) {
      await this.xuiService.addClient(user, {
        id,
        subId,
        email,
        serverId: server.id,
        package: pack,
        name: userPackageName,
      });
    }

    const [financeTransactions, telegramMessages] = await this.payment.purchasePackagePayment(user, {
      userPackageId,
      package: pack,
      receipt: undefined,
      inRenew: false,
      userPackageName,
      isFree: true,
    });

    const lastUserPack = await this.prisma.userPackage.findFirst({
      where: { userId: user.id },
      orderBy: { orderN: 'desc' },
    });

    const createPackageTransactions = this.createPackage(user, {
      id,
      userPackageId,
      subId,
      email,
      server,
      name: userPackageName,
      package: pack,
      isFree: true,
      orderN: (lastUserPack?.orderN || 0) + 1,
    });
    await this.prisma.$transaction([...createPackageTransactions, ...financeTransactions]);

    return this.telegramService.sendBulkMessage(telegramMessages);
  }

  async enableGift(userId: string): Promise<void> {
    const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);
    const user = await this.prisma.user.findFirstOrThrow({
      where: {
        id: userId,
      },
      include: { brand: true, userGift: { include: { giftPackage: true }, where: { isGiftUsed: false } } },
    });

    const userGift = user?.userGift?.[0];
    const gift = await this.prisma.userGift.findUniqueOrThrow({ where: { id: userGift.id } });
    const pack = await this.prisma.package.findUniqueOrThrow({ where: { id: gift.giftPackageId! } });
    const server = await this.getFreeServer(user, pack);
    const email = nanoid();
    const id = uuid();
    const subId = nanoid();
    const userPackageId = uuid();
    const graphqlConfig = this.configService.get<GraphqlConfig>('graphql');
    const userPackageName = 'هدیه 🎁';

    if (!graphqlConfig?.debug) {
      await this.xuiService.addClient(user, {
        id,
        subId,
        email,
        serverId: server.id,
        package: pack,
        name: userPackageName,
      });
    }

    const [financeTransactions, telegramMessages] = await this.payment.purchasePackagePayment(user, {
      userPackageId,
      package: pack,
      receipt: undefined,
      inRenew: false,
      userPackageName,
      isFree: false,
      isGift: true,
    });
    const lastUserPack = await this.prisma.userPackage.findFirst({
      where: { userId: user.id },
      orderBy: { orderN: 'desc' },
    });

    const createPackageTransactions = this.createPackage(user, {
      userPackageId,
      id,
      subId,
      email,
      server,
      name: 'هدیه 🎁',
      package: pack,
      orderN: (lastUserPack?.orderN || 0) + 1,
    });

    await this.prisma.$transaction([
      ...createPackageTransactions,
      ...financeTransactions,
      this.prisma.userGift.update({ where: { id: gift.id }, data: { isGiftUsed: true } }),
    ]);

    return this.telegramService.sendBulkMessage(telegramMessages);
  }

  async renewPackage(user: User, input: RenewPackageInput): Promise<UserPackagePrisma> {
    const userPackageId = uuid();
    const userPack = await this.prisma.userPackage.findUniqueOrThrow({
      where: { id: input.userPackageId },
      include: {
        server: true,
        stat: true,
        package: true,
      },
    });
    const pack = await this.prisma.package.findUniqueOrThrow({ where: { id: input.packageId } });

    // to make up for lose user
    // const isOldUser = new Date(user.createdAt) < new Date('2025-01-29');
    // pack.traffic = pack.traffic * (isOldUser ? 1.2 : 1);

    const role = user.role;
    const discountedPrice = pack.price * (1 - pctToDec(user.appliedDiscountPercent));

    if (role === Role.ADMIN && (discountedPrice < 0 || discountedPrice > user.balance)) {
      throw new BadRequestException(this.i18.__('user.balance.not_enough'));
    }

    const modifiedPack = { ...pack };

    try {
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

        const graphqlConfig = this.configService.get<GraphqlConfig>('graphql');

        if (!graphqlConfig?.debug) {
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
        }

        const [financeTransactions, telegramMessages] = await this.payment.purchasePackagePayment(user, {
          userPackageId,
          package: pack,
          receipt: input.receipt,
          inRenew: true,
          userPackageName: userPack.name,
        });

        const createPackageTransactions = this.createPackage(user, {
          id: userPack.statId,
          userPackageId,
          subId: userPack.stat.subId,
          email: userPack.stat.email,
          server: userPack.server,
          name: userPack.name,
          package: modifiedPack,
          orderN: userPack.orderN,
        });

        await this.prisma.$transaction([
          ...createPackageTransactions,
          ...financeTransactions,
          this.prisma.userPackage.update({
            where: {
              id: userPack.id,
            },
            data: {
              deletedAt: new Date(),
            },
          }),
        ]);
        await this.telegramService.sendBulkMessage(telegramMessages);

        return await this.prisma.userPackage.findFirstOrThrow({ where: { id: userPackageId } });
      }
    } catch {
      // nothing
    }

    await this.xuiService.addClient(user, {
      id: userPack.statId,
      subId: userPack.stat.subId,
      email: userPack.stat.email,
      serverId: userPack.server.id,
      package: modifiedPack,
      name: userPack.name,
      orderN: userPack.orderN,
    });

    const [financeTransactions, telegramMessages] = await this.payment.purchasePackagePayment(user, {
      userPackageId,
      package: pack,
      receipt: input.receipt,
      inRenew: true,
      userPackageName: userPack.name,
    });

    const createPackageTransactions = this.createPackage(user, {
      id: userPack.statId,
      userPackageId,
      subId: userPack.stat.subId,
      email: userPack.stat.email,
      server: userPack.server,
      name: userPack.name,
      package: modifiedPack,
      orderN: userPack.orderN,
    });

    await this.prisma.$transaction([
      ...createPackageTransactions,
      ...financeTransactions,
      this.prisma.userPackage.update({
        where: {
          id: userPack.id,
        },
        data: {
          deletedAt: new Date(),
        },
      }),
    ]);
    await this.telegramService.sendBulkMessage(telegramMessages);

    return this.prisma.userPackage.findFirstOrThrow({ where: { id: userPackageId } });
  }

  generateUserPackageOutput(userPack: UserPackage | UserPackagePrisma): UserPackageOutput {
    const userPackage = userPack as UserPackage;

    return {
      id: userPackage.id,
      createdAt: userPackage.createdAt,
      updatedAt: userPackage.updatedAt,
      name: userPackage.name,
      category: userPackage.package.category,
      categoryFa: this.i18.__(`package.category.${userPackage.package.category}`),
      link: getVlessLink(
        userPack.statId,
        userPackage.server.tunnelDomain,
        `${userPack.name} | ${userPackage.server.brand?.domainName}`,
        userPackage.server.port,
      ),
      remainingTraffic: userPackage.stat.total - (userPackage.stat.down + userPackage.stat.up),
      totalTraffic: userPackage.stat.total,
      expiryTime: userPackage.stat.expiryTime,
      lastConnectedAt: userPackage.stat?.lastConnectedAt,
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
        server: {
          include: {
            brand: true,
          },
        },
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

    return userPacks.map((userPack) => this.generateUserPackageOutput(userPack));
  }

  createPackage(user: User, input: CreatePackageInput): Array<Prisma.PrismaPromise<unknown>> {
    try {
      const clientStat = {
        id: input.id,
        down: 0,
        up: 0,
        flow: '',
        tgId: '',
        subId: input.subId,
        limitIp: input.package.userCount,
        total: roundTo(1024 * 1024 * 1024 * input.package.traffic, 0),
        serverId: input.server.id,
        expiryTime: roundTo(Date.now() + 24 * 60 * 60 * 1000 * input.package.expirationDays, 0),
        enable: true,
        email: input.email,
      };

      return [
        this.prisma.clientStat.upsert({
          where: {
            id: input.id,
          },
          create: clientStat,
          update: clientStat,
        }),
        this.prisma.userPackage.create({
          data: {
            id: input.userPackageId,
            packageId: input.package.id,
            serverId: input.server.id,
            userId: user.id,
            statId: input.id,
            name: input.name,
            orderN: input.orderN,
            isFree: input.isFree || false,
          },
        }),
      ];
    } catch (error) {
      console.error(error);

      throw new BadRequestException('upsert client Stat or create userPackage got failed.');
    }
  }

  async getPackages(user: User, filters: GetPackageInput, id?: string): Promise<DiscountedPackage[]> {
    const { category, expirationDays } = filters;
    let packages = await this.prisma.package.findMany({
      where: {
        deletedAt: null,
        forRole: { has: user.role },
        id,
        category: category ? category : undefined,
        expirationDays: expirationDays && expirationDays > 0 ? expirationDays : undefined,
      },
      orderBy: { order: 'asc' },
    });
    packages = packages.map((pack) => ({
      ...pack,
      categoryFa: this.i18.__(`package.category.${pack.category}`),
    }));
    const parent = user?.parentId ? await this.prisma.user.findUnique({ where: { id: user?.parentId } }) : null;

    const hasParentDiscount = typeof parent?.appliedDiscountPercent === 'number';
    const hasParentProfit = typeof parent?.profitPercent === 'number';

    const packagesDic = arrayToDic(packages);
    const appliedPackPrice =
      hasParentDiscount || hasParentProfit
        ? packages.map((pack) => {
            const parentDiscount = pctToDec(parent?.appliedDiscountPercent);
            const parentProfit = pctToDec(parent?.profitPercent);
            const price = ceilIfNeeded(pack.price * ((1 - parentDiscount) * (1 + parentProfit)), 0);

            return {
              ...pack,
              price,
            };
          })
        : packages;

    return typeof user?.appliedDiscountPercent === 'number'
      ? appliedPackPrice.map((pack) => {
          const discountedPrice = ceilIfNeeded(
            packagesDic[pack.id].price * (1 - pctToDec(user.appliedDiscountPercent)),
            0,
          );

          return {
            ...pack,
            discountedPrice: discountedPrice !== pack.price ? discountedPrice : undefined,
          };
        })
      : appliedPackPrice;
  }
}
