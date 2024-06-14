/* eslint-disable max-len */
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, UserPackage as UserPackagePrisma } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { PrismaService } from 'nestjs-prisma';
import { InjectBot } from 'nestjs-telegraf';
import PQueue from 'p-queue';
import { Telegraf } from 'telegraf';
import { v4 as uuid } from 'uuid';

import {
  arrayToDic,
  bytesToGB,
  convertPersianCurrency,
  getRemainingDays,
  getVlessLink,
  jsonToB64Url,
  midOrder,
  roundTo,
} from '../common/helpers';
import { Context } from '../common/interfaces/context.interface';
import { MinioClientService } from '../minio/minio.service';
import { PaymentService } from '../payment/payment.service';
import { CallbackData } from '../telegram/telegram.constants';
import { User } from '../users/models/user.model';
import { XuiService } from '../xui/xui.service';
import { Stat } from '../xui/xui.types';
import { BuyPackageInput } from './dto/buyPackage.input';
import { RenewPackageInput } from './dto/renewPackage.input';
import { UserPackage } from './models/userPackage.model';
import { CreatePackageInput, SendBuyPackMessageInput } from './package.types';

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

@Injectable()
export class PackageService {
  constructor(
    @InjectBot()
    private readonly bot: Telegraf<Context>,
    private prisma: PrismaService,
    private xuiService: XuiService,
    private readonly payment: PaymentService,
    private readonly configService: ConfigService,
    private readonly minioService: MinioClientService,
  ) {
    // setTimeout(() => {
    //   void this.syncClientStats();
    // }, 2000);
  }

  private readonly logger = new Logger(PackageService.name);

  private readonly webPanel = this.configService.get('webPanelUrl');

  private readonly reportGroupId = this.configService.get('telGroup')!.report;

  private readonly loginToPanelBtn = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'ورود به سایت',
            url: this.webPanel,
          },
        ],
      ],
    },
  };

  /* eslint-disable sonarjs/cognitive-complexity, sonarjs/no-nested-template-literals */
  async updateFinishedPackages(stats: Stat[]) {
    const finishedTrafficPacks = stats.filter((stat) => stat.down + stat.up >= stat.total).map((stat) => stat.id);
    const finishedTimePacks = stats
      .filter((stat) => stat.expiryTime > 0 && stat.expiryTime <= Date.now())
      .map((stat) => stat.id);

    const finishedPacks = [...new Set([...finishedTrafficPacks, ...finishedTimePacks])];

    if (finishedPacks.length === 0) {
      return;
    }

    const finishedUserPacks = await this.prisma.userPackage.findMany({
      where: { statId: { in: finishedPacks }, deletedAt: null, finishedAt: null },
      include: {
        user: {
          include: {
            telegram: true,
          },
        },
        package: true,
      },
    });

    if (finishedUserPacks.length === 0) {
      return;
    }

    const finishedUserPackDic = arrayToDic(finishedUserPacks, 'statId');

    await this.prisma.userPackage.updateMany({
      where: {
        id: {
          in: finishedUserPacks.map((i) => i.id),
        },
      },
      data: {
        finishedAt: new Date(),
      },
    });

    const queue = new PQueue({ concurrency: 1, interval: 1000, intervalCap: 1 });
    const telegramQueue = new PQueue({ concurrency: 1, interval: 1000, intervalCap: 1 });

    for (const finishedTrafficPack of finishedTrafficPacks) {
      const userPack = finishedUserPackDic[finishedTrafficPack];

      if (!userPack) {
        continue;
      }

      const telegramId = userPack?.user?.telegram?.id ? Number(userPack.user.telegram.id) : undefined;

      if (telegramId) {
        const text = `${userPack.user.firstname} جان حجم بسته‌ی ${userPack.package.traffic} گیگ ${userPack.package.expirationDays} روزه به نام "${userPack.name}" به پایان رسید. از طریق سایت می‌تونی تمدید کنی.`;
        void telegramQueue.add(() => this.bot.telegram.sendMessage(telegramId, text, this.loginToPanelBtn));
      }

      void queue.add(() => this.xuiService.deleteClient(userPack.statId));
    }

    for (const finishedTimePack of finishedTimePacks) {
      const userPack = finishedUserPackDic[finishedTimePack];

      if (!userPack) {
        continue;
      }

      const telegramId = userPack?.user?.telegram?.id ? Number(userPack.user.telegram.id) : undefined;

      if (telegramId) {
        const text = `${userPack.user.firstname} جان زمان بسته‌ی ${userPack.package.traffic} گیگ ${userPack.package.expirationDays} روزه به نام "${userPack.name}" به پایان رسید. از طریق سایت می‌تونی تمدید کنی.`;
        void telegramQueue.add(() => this.bot.telegram.sendMessage(telegramId, text, this.loginToPanelBtn));
      }

      void queue.add(() => this.xuiService.deleteClient(userPack.statId));
    }
  }

  async sendThresholdWarning(stats: Stat[]) {
    const thresholdTrafficPacks = stats
      .filter((stat) => stat.down + stat.up >= stat.total * 0.85)
      .map((pack) => pack.id);

    const thresholdTimePacks = stats.filter((stat) => getRemainingDays(stat.expiryTime) <= 2).map((pack) => pack.id);

    const allThresholdPacks = [...new Set([...thresholdTrafficPacks, ...thresholdTimePacks])];

    if (allThresholdPacks.length === 0) {
      return;
    }

    const thresholdUserPacks = await this.prisma.userPackage.findMany({
      where: { statId: { in: allThresholdPacks }, deletedAt: null, thresholdWarningSentAt: null },
      include: {
        user: {
          include: {
            telegram: true,
          },
        },
        package: true,
      },
    });

    if (thresholdUserPacks.length === 0) {
      return;
    }

    const thresholdUserPackDic = arrayToDic(thresholdUserPacks, 'statId');
    await this.prisma.userPackage.updateMany({
      where: {
        id: {
          in: thresholdUserPacks.map((i) => i.id),
        },
      },
      data: {
        thresholdWarningSentAt: new Date(),
      },
    });

    const queue = new PQueue({ concurrency: 1, interval: 1000, intervalCap: 1 });

    for (const thresholdTrafficPack of thresholdTrafficPacks) {
      const userPack = thresholdUserPackDic[thresholdTrafficPack];

      if (!userPack) {
        continue;
      }

      const telegramId = userPack?.user?.telegram?.id ? Number(userPack.user.telegram.id) : undefined;

      if (telegramId) {
        const text = `${userPack.user.firstname} جان ۸۵ درصد حجم بسته‌ی ${userPack.package.traffic} گیگ ${userPack.package.expirationDays} روزه به نام "${userPack.name}" را مصرف کرده‌اید. از طریق سایت می‌تونی تمدید کنی.`;
        void queue.add(() => this.bot.telegram.sendMessage(telegramId, text, this.loginToPanelBtn));
      }
    }

    for (const thresholdTimePack of thresholdTimePacks) {
      const userPack = thresholdUserPackDic[thresholdTimePack];

      if (!userPack) {
        continue;
      }

      const telegramId = userPack?.user?.telegram?.id ? Number(userPack.user.telegram.id) : undefined;

      if (telegramId) {
        const text = `${userPack.user.firstname} جان دو روز دیگه زمان بسته‌ی ${userPack.package.traffic} گیگ ${userPack.package.expirationDays} روزه به نام "${userPack.name}" تموم میشه. از طریق سایت می‌تونی تمدید کنی.`;
        void queue.add(() => this.bot.telegram.sendMessage(telegramId, text, this.loginToPanelBtn));
      }
    }
  }

  async getFreeServer(): Promise<Server> {
    return this.prisma.server.findUniqueOrThrow({ where: { domain: 'ir2.arvanvpn.online:40005' } });
  }

  async buyPackage(user: User, input: BuyPackageInput): Promise<UserPackagePrisma> {
    const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);
    const isBlocked = Boolean(user.isDisabled || user.isParentDisabled);

    if (isBlocked) {
      throw new BadRequestException('Your account is blocked!');
    }

    const server = await this.getFreeServer();
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

    const server = await this.getFreeServer();
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
    } روزه\n🔤 نام بسته: ${userPack.name}\n👤 ${user.firstname} ${user.lastname}\n📞 موبایل: +98${
      user.phone
    }\n💵 شارژ حساب: ${convertPersianCurrency(roundTo(user?.balance || 0, 0))}`;

    await this.bot.telegram.sendMessage(this.reportGroupId, caption);
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

    await this.prisma.userPackage.update({
      where: {
        id: userPack.id,
      },
      data: {
        deletedAt: new Date(),
      },
    });

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
    }\n👤 ${user.firstname} ${user.lastname}\n📞 موبایل: +98${user.phone}\n💵 سود تقریبی: ${convertPersianCurrency(
      roundTo(input.parentProfit || input.profitAmount || 0, 0),
    )}\n`;

    if (user.parentId) {
      const telegramUser = await this.prisma.telegramUser.findUnique({ where: { userId: user.parentId } });

      if (input.receiptBuffer) {
        const rejectData = { R_PACK: input.userPack.id } as CallbackData;
        const acceptData = { A_PACK: input.userPack.id } as CallbackData;

        if (telegramUser) {
          await this.bot.telegram.sendPhoto(
            Number(telegramUser.id),
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
          `\n\n👨 مارکتر: ${parent?.firstname} ${parent?.lastname}\n💵 شارژ حساب: ${convertPersianCurrency(
            roundTo(parent?.balance || 0, 0),
          )}`;
        void this.bot.telegram.sendPhoto(
          this.reportGroupId,
          { source: input.receiptBuffer },
          { caption: reportCaption },
        );

        return;
      }
    }

    const updatedUser = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const reportCaption = caption + `\n💵 شارژ حساب: ${convertPersianCurrency(roundTo(updatedUser?.balance || 0, 0))}`;
    await this.bot.telegram.sendMessage(this.reportGroupId, reportCaption);
  }

  async getUserPackages(user: User): Promise<UserPackage[]> {
    const userPackages: UserPackage[] = [];
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const userPacks = await this.prisma.userPackage.findMany({
      include: {
        stat: true,
        server: true,
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
          userPack.server.domain,
          `${userPack.name} | ${new URL(this.webPanel).hostname}`,
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

  async acceptPurchasePack(userPackId: string): Promise<void> {
    const userPack = await this.prisma.userPackage.findUniqueOrThrow({ where: { id: userPackId } });
    await this.prisma.payment.update({
      where: {
        id: userPack.paymentId!,
      },
      data: {
        status: 'APPLIED',
      },
    });
  }

  async rejectPurchasePack(userPackId: string): Promise<void> {
    const userPack = await this.prisma.userPackage.findUniqueOrThrow({
      where: { id: userPackId },
      include: {
        user: true,
        package: true,
      },
    });
    // const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userPack.userId } });
    const payment = await this.prisma.payment.update({
      where: {
        id: userPack.paymentId!,
      },
      data: {
        status: 'REJECTED',
      },
    });

    await this.prisma.user.update({
      where: {
        id: userPack.user.parentId!,
      },
      data: {
        balance: {
          increment: payment.amount,
        },
        profitBalance: {
          increment: payment.parentProfit,
        },
        totalProfit: {
          decrement: payment.parentProfit,
        },
      },
    });

    await this.prisma.userPackage.update({
      where: { id: userPackId },
      data: {
        deletedAt: new Date(),
      },
    });

    await this.xuiService.deleteClient(userPack.statId);
    await this.xuiService.toggleUserBlock(userPack.userId, true);

    const parent = await this.prisma.user.findUniqueOrThrow({ where: { id: userPack.user.parentId! } });
    const text = `#ریجکتـبسته\n📦 ${userPack.package.traffic} گیگ - ${convertPersianCurrency(
      userPack.package.price,
    )} - ${userPack.package.expirationDays} روزه\n🔤 نام بسته: ${userPack.name}\n👤 خریدار: ${
      userPack.user.firstname
    } ${userPack.user.firstname}\n👨 مارکتر: ${parent?.firstname} ${parent?.lastname}`;
    void this.bot.telegram.sendMessage(this.reportGroupId, text, this.loginToPanelBtn);
  }
}
