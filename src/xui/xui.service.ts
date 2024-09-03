/* eslint-disable max-len */
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { Prisma, Server } from '@prisma/client';
import { AxiosRequestConfig } from 'axios';
import * as Cookie from 'cookie';
import https from 'https';
import { customAlphabet } from 'nanoid';
import { PrismaService } from 'nestjs-prisma';
import PQueue from 'p-queue';
import { firstValueFrom } from 'rxjs';
import { v4 as uuid } from 'uuid';

import { TelGroup } from '../common/configs/config.interface';
import { errors } from '../common/errors';
import {
  arrayToDic,
  getDateTimeString,
  getRemainingDays,
  isSessionExpired,
  isUUID,
  jsonObjectToQueryString,
  roundTo,
} from '../common/helpers';
import { User } from '../users/models/user.model';
import { BrandService } from './../brand/brand.service';
import { TelegramService } from './../telegram/telegram.service';
import { GetClientStatsFiltersInput } from './dto/getClientStatsFilters.input';
import { ClientStat } from './models/clientStat.model';
import {
  AddClientInput,
  AuthenticatedReq,
  InboundListRes,
  InboundSetting,
  OnlineInboundRes,
  Stat,
  UpdateClientInput,
  UpdateClientReqInput,
} from './xui.types';

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
    getDb: `${url}/server/getDb`,
  };
};

@Injectable()
export class XuiService {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly brandService: BrandService,
    private prisma: PrismaService,
    private httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    setTimeout(() => {
      void this.backupDB();
    }, 2000);
  }

  private readonly logger = new Logger(XuiService.name);

  private readonly webPanel = this.configService.get('webPanelUrl');

  private readonly backupGroup = this.configService.get<TelGroup>('telGroup')!.backup;

  // private readonly reportGroupId = this.configService.get('telGroup')!.report;

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

  async login(domain: string): Promise<string> {
    try {
      const password = this.configService.get('xui').password;
      const login = await firstValueFrom(
        this.httpService.post<{ success: boolean }>(ENDPOINTS(domain).login, `username=mamad&password=${password}`, {
          headers: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
          httpsAgent: new https.Agent({
            rejectUnauthorized: false,
          }),
        }),
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

  async getAuthorization(serverId: string): Promise<[string, Server]> {
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

  async authenticatedReq<T>({ serverId, url, method, body, headers, isBuffer }: AuthenticatedReq) {
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

  async getInbounds(serverId: string): Promise<Stat[]> {
    const inbounds = await this.authenticatedReq<InboundListRes>({
      serverId,
      url: (domain) => ENDPOINTS(domain).inbounds,
      method: 'post',
    });

    if (!inbounds.data.obj) {
      throw new BadRequestException('Getting DNS records failed.');
    }

    const clientStats: Stat[] = [];
    inbounds.data.obj.forEach((item) => {
      const setting = JSON.parse(item.settings) as InboundSetting;
      clientStats.push(
        ...item.clientStats.map((stat) => ({
          ...stat,
          ...setting.clients.filter((i) => i.id).find((client) => client.email === stat.email)!,
          port: item.port,
        })),
      );
    });

    return clientStats.filter((i) => i.id);
  }

  async getOnlinesInbounds(serverId: string): Promise<string[]> {
    const inbounds = await this.authenticatedReq<OnlineInboundRes>({
      serverId,
      url: (domain) => ENDPOINTS(domain).onlines,
      method: 'post',
    });

    if (!inbounds.data.obj) {
      return [];
    }

    return inbounds.data.obj;
  }

  async resetClientTraffic(clientStatId: string) {
    const clientStat = await this.prisma.clientStat.findUniqueOrThrow({
      where: { id: clientStatId },
      include: { server: true },
    });

    const res = await this.authenticatedReq<{ success: boolean }>({
      serverId: clientStat.server.id,
      url: (domain) => ENDPOINTS(domain).resetClientTraffic(clientStat.email, clientStat.server.inboundId),
      method: 'post',
    });

    if (!res.data.success) {
      throw new BadRequestException(errors.xui.addClientError);
    }
  }

  async deleteClient(clientStatId: string) {
    const clientStat = await this.prisma.clientStat.findUniqueOrThrow({
      where: { id: clientStatId },
      include: { server: true },
    });

    const res = await this.authenticatedReq<{ success: boolean }>({
      serverId: clientStat.server.id,
      url: (domain) => ENDPOINTS(domain).delClient(clientStat.id, clientStat.server.inboundId),
      method: 'post',
    });

    if (!res.data.success) {
      throw new BadRequestException(errors.xui.addClientError);
    }
  }

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

      const telegramId = userPack?.user?.telegram?.chatId ? Number(userPack.user.telegram.chatId) : undefined;

      if (telegramId) {
        const text = `${userPack.user.fullname} عزیز حجم بسته‌ی ${userPack.package.traffic} گیگ ${userPack.package.expirationDays} روزه به نام "${userPack.name}" به پایان رسید. از طریق سایت می‌تونی تمدید کنی.`;
        const bot = this.telegramService.getBot(userPack.user.brandId as string);
        void telegramQueue.add(() => bot?.telegram.sendMessage(telegramId, text, this.loginToPanelBtn));
      }

      void queue.add(() => this.deleteClient(userPack.statId));
    }

    for (const finishedTimePack of finishedTimePacks) {
      const userPack = finishedUserPackDic[finishedTimePack];

      if (!userPack) {
        continue;
      }

      const telegramId = userPack?.user?.telegram?.chatId ? Number(userPack.user.telegram.chatId) : undefined;

      if (telegramId) {
        const text = `${userPack.user.fullname} عزیز زمان بسته‌ی ${userPack.package.traffic} گیگ ${userPack.package.expirationDays} روزه به نام "${userPack.name}" به پایان رسید. از طریق سایت می‌تونی تمدید کنی.`;
        const bot = this.telegramService.getBot(userPack.user.brandId as string);
        void telegramQueue.add(() => bot.telegram.sendMessage(telegramId, text, this.loginToPanelBtn));
      }

      void queue.add(() => this.deleteClient(userPack.statId));
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

      const telegramId = userPack?.user?.telegram?.chatId ? Number(userPack.user.telegram.chatId) : undefined;

      if (telegramId) {
        const text = `${userPack.user.fullname} عزیز ۸۵ درصد حجم بسته‌ی ${userPack.package.traffic} گیگ ${userPack.package.expirationDays} روزه به نام "${userPack.name}" را مصرف کرده‌اید. از طریق سایت می‌تونی تمدید کنی.`;
        const bot = this.telegramService.getBot(userPack.user.brandId as string);
        void queue.add(() => bot.telegram.sendMessage(telegramId, text, this.loginToPanelBtn));
      }
    }

    for (const thresholdTimePack of thresholdTimePacks) {
      const userPack = thresholdUserPackDic[thresholdTimePack];

      if (!userPack) {
        continue;
      }

      const telegramId = userPack?.user?.telegram?.chatId ? Number(userPack.user.telegram.chatId) : undefined;

      if (telegramId) {
        const text = `${userPack.user.fullname} عزیز دو روز دیگه زمان بسته‌ی ${userPack.package.traffic} گیگ ${userPack.package.expirationDays} روزه به نام "${userPack.name}" تموم میشه. از طریق سایت می‌تونی تمدید کنی.`;
        const bot = this.telegramService.getBot(userPack.user.brandId as string);
        void queue.add(() => bot.telegram.sendMessage(telegramId, text, this.loginToPanelBtn));
      }
    }
  }

  async upsertClientStats(stats: Stat[], serverId: string, onlinesStat: string[]) {
    if (stats.length === 0) {
      return; // Nothing to upsert
    }

    const onlineStatDic = stats.reduce<Record<number, Date>>(
      (dic, stat) => (onlinesStat.includes(stat.email) ? { ...dic, [stat.id]: Date.now() } : dic),
      {},
    );

    await this.sendThresholdWarning(stats);
    await this.updateFinishedPackages(stats);
    const updatedValues: Prisma.Sql[] = [];

    // ? Prisma.sql`to_timestamp(${onlineStatDic[stat.id]} / 1000.0)`

    for (const stat of stats) {
      const lastConnectedAtSQL = onlineStatDic[stat.id]
        ? Prisma.sql`to_timestamp(${onlineStatDic[stat.id]} / 1000.0)`
        : Prisma.sql`NULL`;

      const statSql = Prisma.sql`(${stat.id}::uuid, ${stat.enable}, ${stat.email}, ${stat.up}, ${stat.down}, ${
        stat.total
      }, ${stat.expiryTime}, to_timestamp(${Date.now()} / 1000.0), ${serverId}::uuid, ${stat.flow}, ${stat.subId}, ${
        stat.tgId
      }, ${stat.limitIp || 0}, ${lastConnectedAtSQL})`;
      updatedValues.push(statSql);
    }

    try {
      await this.prisma.$queryRaw`
        INSERT INTO "ClientStat"  (id, "enable", email, up, down, total, "expiryTime", "updatedAt", "serverId", "flow", "subId", "tgId", "limitIp", "lastConnectedAt")
        VALUES ${Prisma.join(updatedValues)}
        ON CONFLICT (id) DO UPDATE
        SET
          id = EXCLUDED.id,
          "enable" = EXCLUDED."enable",
          email = EXCLUDED.email,
          up = EXCLUDED.up,
          down = EXCLUDED.down,
          total = EXCLUDED.total,
          "expiryTime" = EXCLUDED."expiryTime",
          "updatedAt" = EXCLUDED."updatedAt",
          "serverId" = EXCLUDED."serverId",
          "flow" = EXCLUDED."flow",
          "subId" = EXCLUDED."subId",
          "tgId" = EXCLUDED."tgId",
          "limitIp" = EXCLUDED."limitIp",
          "lastConnectedAt" = CASE WHEN EXCLUDED."lastConnectedAt" IS NOT NULL THEN EXCLUDED."lastConnectedAt" ELSE "ClientStat"."lastConnectedAt" END
      `;
    } catch (error) {
      console.error('Error upserting ClientStats:', error);
    }
  }

  async addClient(_user: User, input: AddClientInput): Promise<void> {
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
      url: (domain) => ENDPOINTS(domain).addClient,
      method: 'post',
      body: params,
    });

    if (!res.data.success) {
      throw new BadRequestException(errors.xui.addClientError);
    }
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
      url: (domain) => ENDPOINTS(domain).updateClient(clientStat.id),
      method: 'post',
      body: params,
    });

    if (!res.data.success) {
      throw new BadRequestException(errors.xui.addClientError);
    }
  }

  async toggleClientState(clientId: string, state: boolean) {
    await this.updateClientReq({
      id: clientId,
      enable: state,
    });
  }

  async updateClient(_user: User, input: UpdateClientInput): Promise<void> {
    await this.updateClientReq({
      id: input.id,
      expiryTime: roundTo(Date.now() + 24 * 60 * 60 * 1000 * input.package.expirationDays, 0),
      limitIp: input.package.userCount,
      totalGB: roundTo(1024 * 1024 * 1024 * input.package.traffic, 0),
      enable: input.enable,
    });
  }

  async getClientStats(filters?: GetClientStatsFiltersInput): Promise<ClientStat[]> {
    try {
      return this.prisma.clientStat.findMany({
        where: {
          ...(filters?.id && {
            id: {
              equals: filters.id,
            },
          }),
          // ...(filters?.email && {
          //   email: {
          //     contains: filters.email,
          //   },
          // }),
        },
      });
    } catch {
      throw new BadRequestException('Get ClientStats failed.');
    }
  }

  async toggleUserBlock(userId: string, isBlocked: boolean): Promise<void> {
    try {
      const [userPacks, children] = await Promise.all([
        this.prisma.userPackage.findMany({
          where: {
            userId,
            deletedAt: null,
          },
        }),
        this.prisma.user.findMany({
          where: {
            parentId: userId,
            ...(isBlocked ? {} : { isDisabled: false }),
          },
        }),
      ]);

      const childrenIds = children.map((child) => child.id);

      const childrenPacks = await this.prisma.userPackage.findMany({
        where: {
          userId: {
            in: childrenIds,
          },
          deletedAt: null,
        },
      });

      const allStatIds = [...userPacks, ...childrenPacks].map((pack) => pack.statId);

      const queue = new PQueue({ concurrency: 5, interval: 1000, intervalCap: 5 });

      for (const statId of allStatIds) {
        await queue.add(async () => {
          await this.toggleClientState(statId, !isBlocked);
        });
      }

      await queue.onIdle();

      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: userId },
          data: { isDisabled: isBlocked },
        }),
        this.prisma.user.updateMany({
          where: { id: { in: childrenIds } },
          data: { isParentDisabled: isBlocked },
        }),
      ]);

    } catch (error) {
      console.error('Error toggling user block:', error);

      // You might want to add more sophisticated error handling here
      throw error;
    }
  }

  // @Interval('getServerStatus', 0.25 * 60 * 1000)
  async getServerStatus(): Promise<void> {
    const servers = await this.prisma.server.findMany({ where: { deletedAt: null } });

    for (const server of servers) {
      try {
        const status = await this.authenticatedReq({
          serverId: server.id,
          url: (domain) => ENDPOINTS(domain).serverStatus,
          method: 'post',
        });
      } catch (error) {
        console.error(error);
      }
    }
  }

  // async fixOrder() {
  //   this.logger.debug('fixOrder');
  //   const users = await this.prisma.user.findMany();

  //   for (const user of users) {
  //     try {
  //       const userPacks = await this.prisma.userPackage.findMany({
  //         where: { userId: user.id },
  //         orderBy: { order: 'desc' },
  //       });

  //       let lastOrder = 1;

  //       for (const userPack of userPacks) {
  //         await this.prisma.userPackage.update({ where: { id: userPack.id }, data: { orderN: lastOrder } });
  //         lastOrder += 1;
  //       }
  //       // Upsert ClientStat records in bulk
  //     } catch (error) {
  //       console.error('Error fixOrder', error);
  //     }
  //   }
  // }

  @Interval('backupDB', 1 * 60 * 1000)
  async backupDB() {
    if (this.configService.get('env') === 'development') {
      return;
    }

    this.logger.debug('BackupDB call every 1 min');
    const servers = await this.prisma.server.findMany({ where: { deletedAt: null } });

    for (const server of servers) {
      const res = await this.authenticatedReq<string>({
        serverId: server.id,
        url: (domain) => ENDPOINTS(domain).getDb,
        method: 'get',
        isBuffer: true,
      });

      const firstBrand = await this.brandService.getFirstBrand();
      const bot = this.telegramService.getBot(firstBrand?.id as string);
      void bot.telegram.sendDocument(this.backupGroup, {
        source: res.data,
        filename: `${server.domain.split('.')[0]}-${getDateTimeString()}.db`,
      });
    }
  }

  // @Interval('syncClientStats', 0.25 * 60 * 1000)
  @Interval('syncClientStats', 1 * 60 * 1000)
  async syncClientStats() {
    this.logger.debug('SyncClientStats called every 1 min');
    const servers = await this.prisma.server.findMany({ where: { deletedAt: null } });

    for (const server of servers) {
      try {
        const updatedClientStats = (await this.getInbounds(server.id)).filter((i) => isUUID(i.id));
        const onlinesStat = await this.getOnlinesInbounds(server.id);
        // Upsert ClientStat records in bulk
        await this.upsertClientStats(updatedClientStats, server.id, onlinesStat);
      } catch (error) {
        console.error(`Error syncing ClientStats for server: ${server.id}`, error);
      }
    }
  }
}
