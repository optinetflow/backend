import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, NotAcceptableException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Server, UserPackage, UserPackage as UserPackagePrisma } from '@prisma/client';
import { AxiosRequestConfig } from 'axios';
import * as Cookie from 'cookie';
import https from 'https';
import { customAlphabet } from 'nanoid';
import { PrismaService } from 'nestjs-prisma';
import PQueue from 'p-queue';
import { firstValueFrom } from 'rxjs';
import { v4 as uuid } from 'uuid';

import { errors } from '../common/errors';
import { isSessionExpired, jsonObjectToQueryString, roundTo } from '../common/helpers';
import { Package } from '../package/models/package.model';
import { User } from '../users/models/user.model';
import { CreatePackageInput } from './../package/package.types';
import { AddClientInput, AuthenticatedReq, UpdateClientReqInput } from './../xui/xui.types';

@Injectable()
export class AggregatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
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
      await this.deleteClient(userPack.statId);
    }

    await this.toggleUserBlock(userPack.userId, true);

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

  async toggleUserBlock(userId: string, isBlocked: boolean) {
    const isDev = this.configService.get('env') === 'development';
    const userPacks = await this.prisma.userPackage.findMany({
      where: {
        userId,
        deletedAt: null,
      },
    });

    const children = await this.prisma.user.findMany({
      where: {
        parentId: userId,
        ...(isBlocked
          ? {}
          : {
              isDisabled: false,
            }),
      },
    });

    const childrenIds = children.map((child) => child.id);

    const childrenPacks = await this.prisma.userPackage.findMany({
      where: {
        userId: {
          in: childrenIds,
        },
        deletedAt: null,
      },
    });

    const allStatIds = [...childrenPacks, ...userPacks].map((i) => i.statId);

    const queue = new PQueue({ concurrency: 5, interval: 1000, intervalCap: 5 });

    for (const [i, statId] of allStatIds.entries()) {
      await queue.add(async () => {
        if (!isDev) {
          await this.toggleClientState(statId, !isBlocked);
        }
      });
    }

    await queue.onIdle();
    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        isDisabled: isBlocked,
      },
    });

    await this.prisma.user.updateMany({
      where: {
        id: {
          in: childrenIds,
        },
      },
      data: {
        isParentDisabled: isBlocked,
      },
    });
  }

  async enableGift(user: User, userGiftId: string) {
    const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);

    const gift = await this.prisma.userGift.findUniqueOrThrow({ where: { id: userGiftId } });
    const pack = await this.prisma.package.findUniqueOrThrow({ where: { id: gift.giftPackageId! } });
    const server = await this.getFreeServer(user, pack);
    const email = nanoid();
    const id = uuid();
    const subId = nanoid();
    const userPackageId = uuid();

    await this.addClient(user, {
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

    return { package: pack, userPack };
  }

  private async getFreeServer(user: User, pack: Package): Promise<Server> {
    if (!user.brandId) {
      throw new NotAcceptableException('Brand is not found for this user');
    }

    const brandPackageServer = await this.prisma.brandServerCategory.findUnique({
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

    if (!brandPackageServer?.server) {
      throw new NotAcceptableException(
        `No active server found for brand ${user.brandId} and category ${pack.category}`,
      );
    }

    return brandPackageServer.server;
  }

  private async deleteClient(clientStatId: string) {
    const clientStat = await this.prisma.clientStat.findUniqueOrThrow({
      where: { id: clientStatId },
      include: { server: true },
    });

    const res = await this.authenticatedReq<{ success: boolean }>({
      serverId: clientStat.server.id,
      url: (domain) => this.getEndpoints(domain).delClient(clientStat.id, clientStat.server.inboundId),
      method: 'post',
    });

    if (!res.data.success) {
      throw new BadRequestException(errors.xui.deleteClientError);
    }
  }

  private async authenticatedReq<T>({ serverId, url, method, body, headers, isBuffer }: AuthenticatedReq) {
    const [auth, server] = await this.getAuthorization(serverId);

    const config: AxiosRequestConfig = {
      headers: { ...(headers || {}), cookie: auth },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
      maxContentLength: 10_485_760,
      ...(isBuffer && { responseType: 'arraybuffer' }),
    };

    return firstValueFrom(
      method === 'get'
        ? this.httpService.get<T>(url(server.domain), config)
        : this.httpService[method]<T>(url(server.domain), body, config),
    );
  }

  private getEndpoints(domain: string) {
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
      getDb: `${url}/server/getDb`,
    };
  }

  private async getAuthorization(serverId: string): Promise<[string, Server]> {
    const server = await this.prisma.server.findUniqueOrThrow({ where: { id: serverId, deletedAt: null } });

    if (!isSessionExpired(server.token)) {
      return [`3x-ui=${Cookie.parse(server.token)['3x-ui']}`, server];
    }

    const token = await this.login(server.domain);

    await this.prisma.server.update({
      where: {
        id: serverId,
        deletedAt: null,
      },
      data: {
        token,
      },
    });

    return [`3x-ui=${Cookie.parse(token)['3x-ui']}`, server];
  }

  private async login(domain: string): Promise<string> {
    try {
      const password = this.configService.get('xui').password;
      const login = await firstValueFrom(
        this.httpService.post<{ success: boolean }>(
          this.getEndpoints(domain).login,
          `username=mamad&password=${password}`,
          {
            headers: {
              // eslint-disable-next-line @typescript-eslint/naming-convention
              'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            },
            httpsAgent: new https.Agent({
              rejectUnauthorized: false,
            }),
          },
        ),
      );
      const cookie = login?.headers['set-cookie']?.[1];

      if (!cookie) {
        throw new NotFoundException(errors.xui.accountNotFound);
      }

      return cookie;
    } catch (_error) {
      const error = _error as { response?: string };

      if (error?.response) {
        console.error(error.response);
      }

      throw new BadRequestException();
    }
  }

  private async toggleClientState(clientId: string, state: boolean) {
    await this.updateClientReq({
      id: clientId,
      enable: state,
    });
  }

  async updateClientReq(input: UpdateClientReqInput) {
    const clientStat = await this.prisma.clientStat.findUniqueOrThrow({
      where: { id: input.id },
      include: { server: true },
    });

    const jsonData = {
      id: clientStat.server.inboundId,
      settings: {
        clients: [
          {
            flow: clientStat.flow,
            email: clientStat.email,
            limitIp: clientStat.limitIp,
            totalGB: Number(clientStat.total),
            expiryTime: Number(clientStat.expiryTime),
            enable: clientStat.enable,
            tgId: clientStat.tgId,
            subId: clientStat.subId,
            ...input,
          },
        ],
      },
    };

    const params = jsonObjectToQueryString(jsonData);

    const res = await this.authenticatedReq<{ success: boolean }>({
      serverId: clientStat.server.id,
      url: (domain) => this.getEndpoints(domain).updateClient(clientStat.id),
      method: 'post',
      body: params,
    });

    if (!res.data.success) {
      throw new BadRequestException(errors.xui.addClientError);
    }
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

  private async addClient(_user: User, input: AddClientInput): Promise<void> {
    const server = await this.prisma.server.findUniqueOrThrow({ where: { id: input.serverId } });

    const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);
    const email = input?.email || nanoid();
    const id = input?.id || uuid();
    const subId = input?.subId || nanoid();
    const jsonData = {
      id: server.inboundId,
      settings: {
        clients: [
          {
            id,
            flow: '',
            email,
            limitIp: input.package.userCount,
            totalGB: 1024 * 1024 * 1024 * input.package.traffic,
            expiryTime: Date.now() + 24 * 60 * 60 * 1000 * input.package.expirationDays,
            enable: true,
            tgId: '',
            subId,
          },
        ],
      },
    };

    const params = jsonObjectToQueryString(jsonData);

    const res = await this.authenticatedReq<{ success: boolean }>({
      serverId: input.serverId,
      url: (domain) => this.getEndpoints(domain).addClient,
      method: 'post',
      body: params,
    });

    if (!res.data.success) {
      throw new BadRequestException(errors.xui.addClientError);
    }
  }
}
