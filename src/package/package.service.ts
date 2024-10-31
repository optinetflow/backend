/* eslint-disable max-len */
import { BadRequestException, Injectable, NotAcceptableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Package, Server, UserPackage as UserPackagePrisma } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { PrismaService } from 'nestjs-prisma';
import { v4 as uuid } from 'uuid';

import { GraphqlConfig } from '../common/configs/config.interface';
import {
  bytesToGB,
  ceilTo,
  convertPersianCurrency,
  getVlessLink,
  jsonToB64Url,
  pctToDec,
  roundTo,
} from '../common/helpers';
import { PaymentService } from '../payment/payment.service';
import { CallbackData } from '../telegram/telegram.constants';
import { User } from '../users/models/user.model';
import { XuiService } from '../xui/xui.service';
import { TelegramService } from './../telegram/telegram.service';
import { BuyPackageInput } from './dto/buyPackage.input';
import { GetPackageInput } from './dto/get-packages.input';
import { RenewPackageInput } from './dto/renewPackage.input';
import { UserPackage } from './models/userPackage.model';
import { CreatePackageInput } from './package.types';

const ENDPOINTS = (domain: string) => {
  const url = `https://${domain}/v`;

  return {
    login: `${url}/login`,
    inbounds: `${url}/panel/inbound/list`,
    onlines: `${url}/panel/inbound/onlines`,
    addInbound: `${url}/panel/inbound/add`,
    addClient: `${url}/panel/inbound/addClient`,
    updateClient: (id: string) => `${url}/panel/inbound/updateClient/${id}`,
    resetClientTraffic: (email: string, inboundId: number) =>
      `${url}/panel/inbound/${inboundId}/resetClientTraffic/${email}`,
    delClient: (id: string, inboundId: number) => `${url}/panel/inbound/${inboundId}/delClient/${id}`,
    serverStatus: `${url}/server/status`,
  };
};

interface DiscountedPackage extends Package {
  discountedPrice?: number;
}


@Injectable()
export class PackageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
    private readonly xuiService: XuiService,
    private readonly payment: PaymentService,
    private readonly configService: ConfigService,
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
    const server = await this.getFreeServer(user, pack);
    const email = nanoid();
    const id = uuid();
    const subId = nanoid();
    const userPackageId = uuid();
    const userPackageName = input.name || 'No Name';
    const graphqlConfig = this.configService.get<GraphqlConfig>('graphql');

    if (!graphqlConfig?.debug) {
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

    const userPack = await this.prisma.userPackage.findFirstOrThrow({ where: { id: userPackageId }});

    return userPack;
  }

  async enableGift(user: User, userGiftId: string): Promise<void> {
    const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);

    const gift = await this.prisma.userGift.findUniqueOrThrow({ where: { id: userGiftId } });
    const pack = await this.prisma.package.findUniqueOrThrow({ where: { id: gift.giftPackageId! } });
    const server = await this.getFreeServer(user, pack);
    const email = nanoid();
    const id = uuid();
    const subId = nanoid();
    const userPackageId = uuid();

    await this.xuiService.addClient(user, {
      id,
      subId,
      email,
      serverId: server.id,
      package: pack,
      name: 'هدیه 🎁',
    });

    const lastUserPack = await this.prisma.userPackage.findFirst({
      where: { userId: user.id },
      orderBy: { orderN: 'desc' },
    });


    const createPackageTransactions =this.createPackage(user, {
      userPackageId,
      id,
      subId,
      email,
      server,
      name: 'هدیه 🎁',
      package: pack,
      orderN: (lastUserPack?.orderN || 0) + 1,
    });

    await this.prisma.$transaction(createPackageTransactions);

    const userPack = await this.prisma.userPackage.findFirstOrThrow({ where: { id: userPackageId }});



    await this.prisma.userGift.update({ where: { id: gift.id }, data: { isGiftUsed: true } });

    const caption = `#فعالسازیـهدیه 🎁\n📦 ${pack.traffic} گیگ - ${convertPersianCurrency(pack.price)} - ${
      pack.expirationDays
    } روزه\n🔤 نام بسته: ${userPack.name}\n👤 ${user.fullname}\n📞 موبایل: +98${
      user.phone
    }\n💵 شارژ حساب: ${convertPersianCurrency(roundTo(user?.balance || 0, 0))}`;
    const bot = this.telegramService.getBot(user.brandId as string);

    await bot.telegram.sendMessage(user.brand?.reportGroupId as string, caption);
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

    const modifiedPack = { ...pack };

    try {
      if (!userPack.finishedAt) {
        const remainingDays = (Number(userPack.stat.expiryTime) - Date.now()) / (1000 * 60 * 60 * 24);
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

        await this.prisma.$transaction([...createPackageTransactions, ...financeTransactions, this.prisma.userPackage.update({
          where: {
            id: userPack.id,
          },
          data: {
            deletedAt: new Date(),
          },
        })]);
        await this.telegramService.sendBulkMessage(telegramMessages);

        return await this.prisma.userPackage.findFirstOrThrow({ where: { id: userPackageId }});
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

    await this.prisma.$transaction([...createPackageTransactions, ...financeTransactions, this.prisma.userPackage.update({
      where: {
        id: userPack.id,
      },
      data: {
        deletedAt: new Date(),
      },
    })]);
    await this.telegramService.sendBulkMessage(telegramMessages);

    return await this.prisma.userPackage.findFirstOrThrow({ where: { id: userPackageId }});
  }

  async getUserPackages(user: User): Promise<UserPackage[]> {
    const userPackages: UserPackage[] = [];
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const userPacks = await this.prisma.userPackage.findMany({
      include: {
        stat: true,
        server: {
          include: {
            brand: true,
          },
        },
        package: true
      },
      where: {
        userId: user.id,
        deletedAt: null,
        OR: [{ finishedAt: null }, { finishedAt: { gte: threeDaysAgo } }],
      },
      orderBy: {
        orderN: 'desc',
      },
    });

    for (const userPack of userPacks) {
      userPackages.push({
        id: userPack.id,
        createdAt: userPack.createdAt,
        updatedAt: userPack.updatedAt,
        name: userPack.name,
        package: userPack.package,
        link: getVlessLink(
          userPack.statId,
          userPack.server.tunnelDomain,
          `${userPack.name} | ${userPack.server.brand?.domainName as string}`,
          userPack.server.port,
        ),
        remainingTraffic: userPack.stat.total - (userPack.stat.down + userPack.stat.up),
        totalTraffic: userPack.stat.total,
        expiryTime: userPack.stat.expiryTime,
        lastConnectedAt: userPack.stat?.lastConnectedAt,
      });
    }

    return userPackages;
  }

  createPackage(user: User, input: CreatePackageInput): Array<Prisma.PrismaPromise<any>> {
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
          },
        }),
      ];
    } catch (error) {
      console.error(error);

      throw new BadRequestException('upsert client Stat or create userPackage got failed.');
    }
  }

  async getPackages(user: User, filters: GetPackageInput, id?: string): Promise<DiscountedPackage[]> {
    const {category, expirationDays} = filters
    const packages = await this.prisma.package.findMany({
      where: { deletedAt: null, forRole: { has: user.role }, id,
      category: category ? category : undefined,
      expirationDays: expirationDays && expirationDays > 0 ? expirationDays : undefined
     },
      orderBy: { order: 'asc' },
    });

    const parent = user?.parentId ? await this.prisma.user.findUnique({ where: { id: user?.parentId } }) : null;

    const hasParentDiscount = typeof parent?.appliedDiscountPercent === 'number';
    const hasParentProfit = typeof parent?.profitPercent === 'number';

    const appliedPackPrice =
      hasParentDiscount || hasParentProfit
        ? packages.map((pack) => {
            const parentDiscount = pctToDec(parent?.appliedDiscountPercent);
            const parentProfit = pctToDec(parent?.profitPercent);
            const price = ceilTo(pack.price * ((1 - parentDiscount) * (1 + parentProfit)), 0);

            return {
              ...pack,
              price,
            };
          })
        : packages;

    return typeof user?.appliedDiscountPercent === 'number'
      ? appliedPackPrice.map((pack) => {
          const userDiscount = 1 - pctToDec(user.initialDiscountPercent);
          const discountedPrice = ceilTo(pack.price * userDiscount, 0);

          return {
            ...pack,
            discountedPrice: discountedPrice !== pack.price ? discountedPrice : undefined,
          };
        })
      : appliedPackPrice;
  }
}
