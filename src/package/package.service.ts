/* eslint-disable max-len */
import { BadRequestException, Injectable, NotAcceptableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, UserPackage as UserPackagePrisma } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { PrismaService } from 'nestjs-prisma';
import PQueue from 'p-queue';
import { v4 as uuid } from 'uuid';

import {
  arrayToDic,
  bytesToGB,
  convertPersianCurrency,
  getRemainingDays,
  getVlessLink,
  jsonToB64Url,
  roundTo,
} from '../common/helpers';
import { PaymentService } from '../payment/payment.service';
import { CallbackData } from '../telegram/telegram.constants';
import { User } from '../users/models/user.model';
import { XuiService } from '../xui/xui.service';
import { Stat } from '../xui/xui.types';
import { TelegramService } from './../telegram/telegram.service';
import { BuyPackageInput } from './dto/buyPackage.input';
import { RenewPackageInput } from './dto/renewPackage.input';
import { UserPackage } from './models/userPackage.model';
import { CreatePackageInput, SendBuyPackMessageInput } from './package.types';

@Injectable()
export class PackageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
    private readonly xuiService: XuiService,
    private readonly payment: PaymentService,
    private readonly configService: ConfigService,
  ) {}

  async getFreeServer(user: User): Promise<Server> {
    if (!user.brand?.activeServerId) {
      throw new NotAcceptableException('Active Server is not Found');
    }

    return this.prisma.server.findUniqueOrThrow({ where: { id: user.brand?.activeServerId } });
  }

  async buyPackage(user: User, input: BuyPackageInput): Promise<UserPackagePrisma> {
    const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);
    const isBlocked = Boolean(user.isDisabled || user.isParentDisabled);

    if (isBlocked) {
      throw new BadRequestException('Your account is blocked!');
    }

    const server = await this.getFreeServer(user);
    const pack = await this.prisma.package.findUniqueOrThrow({ where: { id: input.packageId } });
    const paymentId = uuid();
    const email = nanoid();
    const id = uuid();
    const subId = nanoid();

    await this.xuiService.addClient(user, {
      id,
      subId,
      email,
      serverId: server.id,
      package: pack,
      name: input.name || 'No Name',
    });

    const { receiptBuffer, parentProfit, profitAmount } = await this.payment.purchasePaymentRequest(user, {
      amount: pack.price,
      id: paymentId,
      receipt: input.receipt,
    });

    const lastUserPack = await this.prisma.userPackage.findFirst({
      where: { userId: user.id },
      orderBy: { orderN: 'desc' },
    });

    const userPack = await this.createPackage(user, {
      id,
      subId,
      email,
      server,
      name: input.name || 'No Name',
      package: pack,
      paymentId,
      orderN: (lastUserPack?.orderN || 0) + 1,
    });

    await this.sendBuyPackMessage(user, {
      inRenew: false,
      pack,
      parentProfit,
      profitAmount,
      receiptBuffer,
      userPack,
    });

    return userPack;
  }

  async enableGift(user: User, userGiftId: string): Promise<void> {
    const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);

    const server = await this.getFreeServer(user);
    const gift = await this.prisma.userGift.findUniqueOrThrow({ where: { id: userGiftId } });
    const pack = await this.prisma.package.findUniqueOrThrow({ where: { id: gift.giftPackageId! } });
    const email = nanoid();
    const id = uuid();
    const subId = nanoid();

    await this.xuiService.addClient(user, {
      id,
      subId,
      email,
      serverId: server.id,
      package: pack,
      name: 'وصل کن دات کام',
    });

    const lastUserPack = await this.prisma.userPackage.findFirst({
      where: { userId: user.id },
      orderBy: { orderN: 'desc' },
    });

    const userPack = await this.createPackage(user, {
      id,
      subId,
      email,
      server,
      name: 'وصل کن دات کام',
      package: pack,
      orderN: (lastUserPack?.orderN || 0) + 1,
    });

    await this.prisma.userGift.update({ where: { id: gift.id }, data: { isGiftUsed: true } });

    const caption = `#فعالسازیـهدیه\n📦 ${pack.traffic} گیگ - ${convertPersianCurrency(pack.price)} - ${
      pack.expirationDays
    } روزه\n🔤 نام بسته: ${userPack.name}\n👤 ${user.fullname}\n📞 موبایل: +98${
      user.phone
    }\n💵 شارژ حساب: ${convertPersianCurrency(roundTo(user?.balance || 0, 0))}`;
    const bot = this.telegramService.getBot(user.brandId as string);

    await bot.telegram.sendMessage(user.brand?.reportGroupId as string, caption);
  }

  async renewPackage(user: User, input: RenewPackageInput): Promise<UserPackagePrisma> {
    const userPack = await this.prisma.userPackage.findUniqueOrThrow({
      where: { id: input.userPackageId },
      include: {
        server: true,
        stat: true,
        package: true,
      },
    });
    const pack = await this.prisma.package.findUniqueOrThrow({ where: { id: input.packageId } });
    const paymentId = uuid();

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

        const { receiptBuffer, parentProfit, profitAmount } = await this.payment.purchasePaymentRequest(user, {
          amount: pack.price,
          id: paymentId,
          receipt: input.receipt,
        });

        const userNewPack = await this.createPackage(user, {
          id: userPack.statId,
          subId: userPack.stat.subId,
          email: userPack.stat.email,
          server: userPack.server,
          name: userPack.name,
          package: modifiedPack,
          paymentId,
          orderN: userPack.orderN,
        });

        await this.prisma.userPackage.update({
          where: {
            id: userPack.id,
          },
          data: {
            deletedAt: new Date(),
          },
        });

        await this.sendBuyPackMessage(user, {
          inRenew: true,
          pack,
          userPack: userNewPack,
          parentProfit,
          profitAmount,
          receiptBuffer,
        });

        return userNewPack;
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

    const { receiptBuffer, parentProfit, profitAmount } = await this.payment.purchasePaymentRequest(user, {
      amount: pack.price,
      id: paymentId,
      receipt: input.receipt,
    });

    const userNewPack = await this.createPackage(user, {
      id: userPack.statId,
      subId: userPack.stat.subId,
      email: userPack.stat.email,
      server: userPack.server,
      name: userPack.name,
      package: modifiedPack,
      paymentId,
      orderN: userPack.orderN,
    });

    await this.prisma.userPackage.update({
      where: {
        id: userPack.id,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    await this.sendBuyPackMessage(user, {
      inRenew: true,
      pack,
      userPack: userNewPack,
      parentProfit,
      profitAmount,
      receiptBuffer,
    });

    return userNewPack;
  }

  async sendBuyPackMessage(user: User, input: SendBuyPackMessageInput) {
    const caption = `${input.inRenew ? '#تمدیدـبسته' : '#خریدـبسته'}\n📦 ${
      input.pack.traffic
    } گیگ - ${convertPersianCurrency(input.pack.price)} - ${input.pack.expirationDays} روزه\n🔤 نام بسته: ${
      input.userPack.name
    }\n👤 ${user.fullname}\n📞 موبایل: +98${user.phone}\n💵 سود تقریبی: ${convertPersianCurrency(
      roundTo(input.parentProfit || input.profitAmount || 0, 0),
    )}\n`;

    if (user.parentId) {
      const telegramUser = await this.prisma.telegramUser.findUnique({
        where: { userId: user.parentId },
        include: {
          user: true,
        },
      });

      if (input.receiptBuffer) {
        const rejectData = { R_PACK: input.userPack.id } as CallbackData;
        const acceptData = { A_PACK: input.userPack.id } as CallbackData;

        if (telegramUser) {
          const bot = this.telegramService.getBot(telegramUser.user.brandId as string);
          await bot.telegram.sendPhoto(
            Number(telegramUser.chatId),
            { source: input.receiptBuffer },
            {
              caption,
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      callback_data: jsonToB64Url(rejectData as Record<string, string>),
                      text: '❌ رد',
                    },
                    {
                      callback_data: jsonToB64Url(acceptData as Record<string, string>),
                      text: '✅ تایید',
                    },
                  ],
                ],
              },
            },
          );
        }

        const parent = await this.prisma.user.findUnique({ where: { id: user.parentId } });
        const reportCaption =
          caption +
          `\n\n👨 مارکتر: ${parent?.fullname}\n💵 شارژ حساب: ${convertPersianCurrency(
            roundTo(parent?.balance || 0, 0),
          )}`;
        const bot = this.telegramService.getBot(user.brandId as string);
        await bot.telegram.sendPhoto(
          user.brand?.reportGroupId as string,
          { source: input.receiptBuffer },
          { caption: reportCaption },
        );

        return;
      }
    }

    const updatedUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: {
        brand: true,
      },
    });
    const reportCaption = caption + `\n💵 شارژ حساب: ${convertPersianCurrency(roundTo(updatedUser?.balance || 0, 0))}`;
    const bot = this.telegramService.getBot(updatedUser.brandId as string);
    await bot?.telegram.sendMessage(updatedUser.brand?.reportGroupId as string, reportCaption);
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

  async createPackage(user: User, input: CreatePackageInput): Promise<UserPackagePrisma> {
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

      const [_, userPackage] = await this.prisma.$transaction([
        this.prisma.clientStat.upsert({
          where: {
            id: input.id,
          },
          create: clientStat,
          update: clientStat,
        }),
        this.prisma.userPackage.create({
          data: {
            packageId: input.package.id,
            serverId: input.server.id,
            userId: user.id,
            statId: input.id,
            paymentId: input.paymentId,
            name: input.name,
            orderN: input.orderN,
          },
        }),
      ]);

      return userPackage;
    } catch (error) {
      console.error(error);

      throw new BadRequestException('upsert client Stat or create userPackage got failed.');
    }
  }

  async getPackages(user: User) {
    return this.prisma.package.findMany({
      where: { deletedAt: null, forRole: { has: user.role } },
      orderBy: { order: 'asc' },
    });
  }
}
