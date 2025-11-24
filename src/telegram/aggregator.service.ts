import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Country, Prisma, UserPackage, UserPackage as UserPackagePrisma } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { PrismaService } from 'nestjs-prisma';
import { v4 as uuid } from 'uuid';

import { ClientManagementService } from '../common/services/client-management.service';
import { ServerManagementService } from '../common/services/server-management.service';
import { XuiClientService } from '../common/services/xui-client.service';
import { Package } from '../package/models/package.model';
import { User } from '../users/models/user.model';
import { CreatePackageInput } from './../package/package.types';
import { AddClientInput, UpdateClientReqInput } from './../xui/xui.types';

@Injectable()
export class AggregatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly xuiClientService: XuiClientService,
    private readonly serverManagementService: ServerManagementService,
    private readonly clientManagementService: ClientManagementService,
  ) {}

  async acceptPurchasePack(userPackageId: string): Promise<void> {
    await this.prisma.payment.updateMany({
      where: {
        userPackageId,
      },
      data: {
        status: 'APPLIED',
      },
    });
  }

  async rejectPurchasePack(userPackageId: string) {
    const userPack = await this.prisma.userPackage.findUniqueOrThrow({
      where: { id: userPackageId },
      include: {
        user: {
          include: {
            brand: true,
          },
        },
        package: true,
      },
    });
    const payments = await this.prisma.payment.findMany({
      where: {
        userPackageId,
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const financeTransactions: Array<Prisma.PrismaPromise<any>> = [];
    financeTransactions.push(
      this.prisma.payment.updateMany({
        where: {
          userPackageId,
        },
        data: {
          status: 'REJECTED',
        },
      }),
      this.prisma.userPackage.update({
        where: { id: userPackageId },
        data: {
          deletedAt: new Date(),
        },
      }),
    );

    for (const payment of payments) {
      if (userPack.user.id !== payment.payerId) {
        financeTransactions.push(
          this.prisma.user.update({
            where: {
              id: payment.payerId,
            },
            data: {
              balance: {
                increment: payment.amount,
              },
            },
          }),
        );
      }
    }

    await this.prisma.$transaction(financeTransactions);

    const isDev = this.configService.get('env') === 'development';

    if (!isDev) {
      await this.xuiClientService.deleteClient(userPack.statId);
    }

    // await this.clientManagementService.toggleUserBlock(userPack.userId, true);

    return userPack;
  }

  async acceptRechargePack(paymentId: string): Promise<void> {
    await this.prisma.payment.update({
      where: {
        id: paymentId,
      },
      data: {
        status: 'APPLIED',
      },
    });
  }

  async rejectRechargePack(paymentId: string): Promise<User> {
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: {
        id: paymentId,
      },
    });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payment.payerId } });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const financeTransactions: Array<Prisma.PrismaPromise<any>> = [];

    financeTransactions.push(
      this.prisma.payment.update({
        where: {
          id: paymentId,
        },
        data: {
          status: 'REJECTED',
        },
      }),
      this.prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          balance: {
            decrement: payment.amount,
          },
        },
      }),
      this.prisma.user.update({
        where: {
          id: user.parentId!,
        },
        data: {
          balance: {
            increment: payment.amount,
          },
        },
      }),
    );

    await this.prisma.$transaction(financeTransactions);

    return user;
  }

  async enableGift(user: User, userGiftId: string) {
    const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);

    const gift = await this.prisma.userGift.findUniqueOrThrow({ where: { id: userGiftId } });
    const pack = await this.prisma.package.findUniqueOrThrow({ where: { id: gift.giftPackageId! } });
    const server = await this.serverManagementService.getFreeServer(user, pack, Country.de);
    const email = nanoid();
    const id = uuid();
    const subId = nanoid();
    const userPackageId = uuid();

    await this.clientManagementService.addClient(user, [
      {
        id,
        subId,
        email,
        serverId: server.id,
        package: pack,
        name: 'هدیه 🎁',
      },
    ]);

    const lastUserPack = await this.prisma.userPackage.findFirst({
      where: { userId: user.id },
      orderBy: { orderN: 'desc' },
    });

    const createPackageTransactions = this.clientManagementService.createPackage(user, {
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

    const userPack = await this.prisma.userPackage.findFirstOrThrow({ where: { id: userPackageId } });

    await this.prisma.userGift.update({ where: { id: gift.id }, data: { isGiftUsed: true } });

    return { package: pack, userPack };
  }
}
