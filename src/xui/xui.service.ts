/* eslint-disable max-len */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { PackageCategory, Prisma, Server } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { PrismaService } from 'nestjs-prisma';
import PQueue from 'p-queue';
import { v4 as uuid } from 'uuid';

import { errors } from '../common/errors';
import {
  arrayToDic,
  excludeFromArr,
  extractSubdomain,
  getDateTimeString,
  getRemainingDays,
  isUUID,
  jsonObjectToQueryString,
  NetStatSample,
  Period,
  roundTo,
  suggestWeights,
  uniqByKeys,
} from '../common/helpers';
import { ClientManagementService } from '../common/services/client-management.service';
import { XuiClientService } from '../common/services/xui-client.service';
import { TelegramErrorHandler } from '../telegram/telegram-error-handler';
import { User } from '../users/models/user.model';
import { BrandService } from './../brand/brand.service';
import { TelegramService } from './../telegram/telegram.service';
import { GetClientStatsFiltersInput } from './dto/getClientStatsFilters.input';
import { ClientStat } from './models/clientStat.model';
import {
  AddClientInput,
  InboundListRes,
  InboundSetting,
  OnlineInboundRes,
  ServerStat,
  Stat,
  UpdateClientInput,
  UpdateClientReqInput,
} from './xui.types';

interface BulkDeleteResult {
  successful: number;
  failed: number;
  errors: string[];
}

export interface ClientInput {
  id: string;
  flow: string;
  email: string;
  limitIp: number;
  totalGB: number;
  expiryTime: number;
  enable: boolean;
  tgId: string;
  reset: number;
  comment: string;
  subId: string;
}

const ENDPOINTS = (domain: string) => {
  // const url = `https://${domain}/v`;
  const url = `${domain}/v`;

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
    delDepletedClients: `${url}/panel/inbound/delDepletedClients/-1`,
  };
};

@Injectable()
export class XuiService {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly brandService: BrandService,
    private prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly xuiClientService: XuiClientService,
    private readonly clientManagementService: ClientManagementService,
  ) {}

  // async onModuleInit() {}

  private readonly logger = new Logger(XuiService.name);

  private loginToPanelBtn(url: string) {
    return {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'ورود به سایت',
              url,
            },
          ],
        ],
      },
    };
  }

  async getInbounds(serverId: string): Promise<Stat[]> {
    const inbounds = await this.xuiClientService.authenticatedReq<InboundListRes>({
      serverId,
      url: (domain) => this.xuiClientService.getEndpoints(domain).inbounds,
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
    const inbounds = await this.xuiClientService.authenticatedReq<OnlineInboundRes>({
      serverId,
      url: (domain) => this.xuiClientService.getEndpoints(domain).onlines,
      method: 'post',
    });

    if (!inbounds.data.obj) {
      return [];
    }

    return inbounds.data.obj;
  }

  async resetClientTraffic(clientStatId: string) {
    try {
      const clientStat = await this.prisma.clientStat.findUniqueOrThrow({
        where: { id: clientStatId },
        include: { server: true },
      });

      const res = await this.xuiClientService.authenticatedReq<{ success: boolean }>({
        serverId: clientStat.server.id,
        url: (domain) =>
          this.xuiClientService.getEndpoints(domain).resetClientTraffic(clientStat.email, clientStat.server.inboundId),
        method: 'post',
      });

      if (!res.data.success) {
        this.logger.error('Failed to reset client traffic', {
          clientStatId,
          email: clientStat.email,
          serverId: clientStat.server.id,
          serverDomain: clientStat.server.domain,
          inboundId: clientStat.server.inboundId,
          response: res.data,
        });

        throw new BadRequestException(errors.xui.resetClientTrafficError);
      }
    } catch (error) {
      this.logger.error('Error in resetClientTraffic', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        clientStatId,
      });

      throw error;
    }
  }

  async bulkDeleteClients(
    clientStatIds: string[],
    server?: { id: string; inboundId: number },
  ): Promise<BulkDeleteResult> {
    if (clientStatIds.length === 0) {
      return { successful: 0, failed: 0, errors: [] };
    }

    interface ServerInfo {
      id: string;
      inboundId: number;
    }
    interface ClientWithServer {
      id: string;
      server: ServerInfo;
    }
    interface DeleteResult {
      id: string;
      ok: boolean;
      message?: string;
    }

    // -- helpers (move logic out of the main function to reduce complexity) --
    const resolveClients = async (): Promise<{
      byId: Map<string, ClientWithServer>;
      missingIds: string[];
    }> => {
      if (server) {
        // Skip DB: use the same server for all IDs
        const map = new Map<string, ClientWithServer>();

        for (const id of clientStatIds) {
          map.set(id, { id, server });
        }

        return { byId: map, missingIds: [] };
      }

      // Default: fetch from DB
      const clientStats = await this.prisma.clientStat.findMany({
        where: { id: { in: clientStatIds } },
        include: { server: true },
      });

      const byId = new Map<string, ClientWithServer>(clientStats.map((cs: ClientWithServer) => [cs.id, cs]));

      const missingIds = clientStatIds.filter((id) => !byId.has(id));

      return { byId, missingIds };
    };

    const deleteClient = async (cs: ClientWithServer): Promise<DeleteResult> => {
      try {
        await this.xuiClientService.deleteClient(cs.id);

        return { id: cs.id, ok: true };
      } catch (error: unknown) {
        const errorMessage = String(error instanceof Error ? error.message : 'Unknown error');

        return { id: cs.id, ok: false, message: `Error deleting ${cs.id}: ${errorMessage}` };
      }
    };

    // -- main flow (now straightforward) --
    const { byId, missingIds } = await resolveClients();

    const queue = new PQueue({ concurrency: 1, interval: 1000, intervalCap: 1 });
    const validClientIds = clientStatIds.filter((id) => byId.has(id));
    const tasks = validClientIds.map((id) => () => deleteClient(byId.get(id)!));

    const results: DeleteResult[] = await Promise.all(tasks.map((t) => queue.add(t)));

    const successful = results.filter((r) => r.ok).length;
    const failedFromApi = results.length - successful;
    const finalErrors = [
      ...results.filter((r) => !r.ok && r.message).map((r) => r.message as string),
      ...missingIds.map((id) => `Not found: ${id}`),
    ];

    return {
      successful,
      failed: failedFromApi + missingIds.length,
      errors: finalErrors,
    };
  }

  async delDepletedClients(serverId: string) {
    const res = await this.xuiClientService.authenticatedReq<{ success: boolean }>({
      serverId,
      url: (domain) => this.xuiClientService.getEndpoints(domain).delDepletedClients,
      method: 'post',
    });

    if (!res.data.success) {
      throw new BadRequestException(errors.xui.delDepletedClients);
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
            brand: true,
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

    const telegramQueue = new PQueue({ concurrency: 5, interval: 1000, intervalCap: 5 });

    for (const finishedTrafficPack of finishedTrafficPacks.filter((i) => finishedUserPackDic[i])) {
      const userPack = finishedUserPackDic[finishedTrafficPack];
      const bot = this.telegramService.getBot(userPack.user.brandId);

      if (!userPack) {
        continue;
      }

      const telegramId = userPack?.user?.telegram?.chatId ? Number(userPack.user.telegram.chatId) : undefined;

      if (telegramId) {
        const text = `${userPack.user.fullname} عزیز حجم بسته‌ی ${userPack.package.traffic} گیگ ${userPack.package.expirationDays} روزه به نام "${userPack.name}" به پایان رسید. از طریق سایت می‌تونی تمدید کنی.`;
        await telegramQueue.add(async () => {
          await TelegramErrorHandler.safeTelegramCall(
            () =>
              bot.telegram.sendMessage(
                telegramId,
                text,
                this.loginToPanelBtn(userPack.user.brand?.domainName as string),
              ),
            'Send finished traffic pack notification',
            telegramId,
          );
        });
      }
    }

    for (const finishedTimePack of finishedTimePacks.filter((i) => finishedUserPackDic[i])) {
      const userPack = finishedUserPackDic[finishedTimePack];

      if (!userPack) {
        continue;
      }

      const bot = this.telegramService.getBot(userPack.user.brandId);

      const telegramId = userPack?.user?.telegram?.chatId ? Number(userPack.user.telegram.chatId) : undefined;

      if (telegramId) {
        const text = `${userPack.user.fullname} عزیز زمان بسته‌ی ${userPack.package.traffic} گیگ ${userPack.package.expirationDays} روزه به نام "${userPack.name}" به پایان رسید. از طریق سایت می‌تونی تمدید کنی.`;
        await telegramQueue.add(async () => {
          await TelegramErrorHandler.safeTelegramCall(
            () =>
              bot.telegram.sendMessage(
                telegramId,
                text,
                this.loginToPanelBtn(userPack.user.brand?.domainName as string),
              ),
            'Send finished time pack notification',
            telegramId,
          );
        });
      }
    }

    await telegramQueue.onIdle();
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
            brand: true,
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

    const queue = new PQueue({ concurrency: 5, interval: 1000, intervalCap: 5 });

    for (const thresholdTrafficPack of thresholdTrafficPacks.filter((i) => thresholdUserPackDic[i])) {
      const userPack = thresholdUserPackDic[thresholdTrafficPack];
      const bot = this.telegramService.getBot(userPack.user.brandId);

      if (!userPack) {
        continue;
      }

      const telegramId = userPack?.user?.telegram?.chatId ? Number(userPack.user.telegram.chatId) : undefined;

      if (telegramId) {
        const text = `${userPack.user.fullname} عزیز ۸۵ درصد حجم بسته‌ی ${userPack.package.traffic} گیگ ${userPack.package.expirationDays} روزه به نام "${userPack.name}" را مصرف کرده‌اید. از طریق سایت می‌تونی تمدید کنی.`;
        await queue.add(async () => {
          await TelegramErrorHandler.safeTelegramCall(
            () =>
              bot.telegram.sendMessage(
                telegramId,
                text,
                this.loginToPanelBtn(userPack.user.brand?.domainName as string),
              ),
            'Send threshold warning (85% traffic)',
            telegramId,
          );
        });
      }
    }

    for (const thresholdTimePack of thresholdTimePacks.filter((i) => thresholdUserPackDic[i])) {
      const userPack = thresholdUserPackDic[thresholdTimePack];
      const bot = this.telegramService.getBot(userPack.user.brandId);

      if (!userPack) {
        continue;
      }

      const telegramId = userPack?.user?.telegram?.chatId ? Number(userPack.user.telegram.chatId) : undefined;

      if (telegramId) {
        const text = `${userPack.user.fullname} عزیز دو روز دیگه زمان بسته‌ی ${userPack.package.traffic} گیگ ${userPack.package.expirationDays} روزه به نام "${userPack.name}" تموم میشه. از طریق سایت می‌تونی تمدید کنی.`;
        await queue.add(async () => {
          await TelegramErrorHandler.safeTelegramCall(
            () =>
              bot.telegram.sendMessage(
                telegramId,
                text,
                this.loginToPanelBtn(userPack.user.brand?.domainName as string),
              ),
            'Send threshold warning (2 days remaining)',
            telegramId,
          );
        });
      }
    }

    await queue.onIdle();
  }

  async syncNotExistClientStats(stats: Stat[], serverId: string) {
    const statsInDb = await this.prisma.userPackage.findMany({
      where: {
        serverId,
        finishedAt: null,
      },
    });
    const statIdsInDb = statsInDb.map((stat) => stat.statId);

    const notExistStatIds = excludeFromArr(
      statIdsInDb,
      stats.map((stat) => stat.id),
    );

    await this.prisma.userPackage.updateMany({
      where: {
        statId: {
          in: notExistStatIds,
        },
      },
      data: {
        finishedAt: new Date(),
      },
    });
  }

  async upsertClientStats(stats: Array<Stat & { serverId: string }>, onlinesStat: string[]) {
    const isDev = this.configService.get('env') === 'development';

    if (stats.length === 0) {
      return; // Nothing to upsert
    }

    const onlineStatDic = stats.reduce<Record<number, Date>>(
      (dic, stat) => (onlinesStat.includes(stat.email) ? { ...dic, [stat.id]: Date.now() } : dic),
      {},
    );

    // Step 1: CRITICAL - Upsert the stats first (this is the core operation)
    const updatedValues: Prisma.Sql[] = [];

    for (const stat of stats) {
      const lastConnectedAtSQL = onlineStatDic[stat.id]
        ? Prisma.sql`to_timestamp(${onlineStatDic[stat.id]} / 1000.0)`
        : Prisma.sql`NULL`;

      const statSql = Prisma.sql`(${stat.id}::uuid, ${stat.enable}, ${stat.email}, ${stat.up}, ${stat.down}, ${
        stat.total
      }, ${stat.expiryTime}, to_timestamp(${Date.now()} / 1000.0), ${stat.serverId}::uuid, ${stat.flow || ''}, ${
        stat.subId
      }, ${stat.tgId || ''}, ${stat.limitIp || 0}, ${lastConnectedAtSQL})`;
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
      this.logger.error('CRITICAL: Failed to upsert ClientStats', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        statsCount: stats.length,
        serverIds: [...new Set(stats.map((s) => s.serverId))],
      });

      throw error; // Re-throw as this is critical
    }

    // Step 2: NON-CRITICAL - Run secondary operations with proper dependency chain
    // These should NOT prevent the sync from succeeding, but have dependencies
    if (!isDev) {
      const serverId = stats[0]?.serverId;
      let canProceedWithCleanup = true;

      // Group 1: Package status tracking (must succeed together for data consistency)
      try {
        await this.sendThresholdWarning(stats);
        await this.updateFinishedPackages(stats);
      } catch (error) {
        canProceedWithCleanup = false;
        this.logger.error('Non-critical: Failed to update package status (warnings/finished packages)', {
          error: error instanceof Error ? error.message : String(error),
          serverId,
          impact:
            'Skipping cleanup operations (syncNotExistClientStats, delDepletedClients) to prevent data inconsistency',
        });
        // Don't continue to cleanup operations
      }

      // Group 2: Cleanup operations (ONLY run if Group 1 succeeded)
      if (canProceedWithCleanup) {
        // Sync non-existent client stats (depends on updateFinishedPackages)
        try {
          await this.syncNotExistClientStats(stats, serverId);
        } catch (error) {
          this.logger.error('Non-critical: Failed to sync non-existent client stats', {
            error: error instanceof Error ? error.message : String(error),
            serverId,
          });
          // Continue to next cleanup operation
        }

        // Delete depleted clients (depends on package status being tracked)
        try {
          await this.delDepletedClients(serverId);
        } catch (error) {
          this.logger.error('Non-critical: Failed to delete depleted clients', {
            error: error instanceof Error ? error.message : String(error),
            serverId,
          });
          // Continue processing
        }
      }
    }
  }

  async updateClient(_user: User, input: UpdateClientInput): Promise<void> {
    try {
      await this.clientManagementService.updateClientReq({
        id: input.id,
        expiryTime: roundTo(Date.now() + 24 * 60 * 60 * 1000 * input.package.expirationDays, 0),
        limitIp: input.package.userCount,
        totalGB: roundTo(1024 * 1024 * 1024 * input.package.traffic, 0),
        enable: input.enable,
      });
    } catch (error) {
      this.logger.error('Error updating client', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        clientId: input.id,
        packageTraffic: input.package.traffic,
        packageExpirationDays: input.package.expirationDays,
        serverId: input.server.id,
        serverDomain: input.server.domain,
      });

      throw error;
    }
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
        },
      });
    } catch {
      throw new BadRequestException('Get ClientStats failed.');
    }
  }

  async toggleUserBlock(userId: string, isBlocked: boolean): Promise<void> {
    return this.clientManagementService.toggleUserBlock(userId, isBlocked);
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
    const isDev = this.configService.get('env') === 'development';

    if (isDev) {
      return;
    }

    this.logger.debug('BackupDB call every 1 min');
    const servers = await this.prisma.server.findMany({
      where: { deletedAt: null, category: { not: null } },
    });

    const uniqueServers = uniqByKeys(servers, 'domain');

    const queue = new PQueue({ concurrency: 3, interval: 1000, intervalCap: 3 });

    for (const server of uniqueServers) {
      await queue.add(async () => {
        try {
          const res = await this.xuiClientService.authenticatedReq<string>({
            serverId: server.id,
            url: (domain) => this.xuiClientService.getEndpoints(domain).getDb,
            method: 'get',
            isBuffer: true,
          });

          const brandId = 'da99bcd1-4a96-416f-bc38-90c5b363573e';
          const backupGroupId = (await this.prisma.brand.findUniqueOrThrow({ where: { id: brandId } })).backupGroupId!;

          const bot = this.telegramService.getBot(brandId);
          await TelegramErrorHandler.safeTelegramCall(
            () =>
              bot.telegram.sendDocument(backupGroupId, {
                source: res.data,
                filename: `${server.domain.split('.')[0]}-${getDateTimeString()}.db`,
              }),
            'Send XUI database backup to backup group',
            backupGroupId,
          );
        } catch (error) {
          console.error(`Error backing up database for server: ${server.id}`, error);
        }
      });
    }

    await queue.onIdle();
  }

  /**
   * Sync a single server with retry logic and isolated error handling
   */
  private async syncSingleServer(server: Server, allServers: Server[], retryCount = 0): Promise<void> {
    const MAX_RETRIES = 2;

    try {
      // Step 1: Fetch data (with retry on network errors)
      const updatedClientStats = (await this.getInbounds(server.id)).filter((i) => isUUID(i.id));
      // .filter((stat) => stat.inboundId === server.inboundId);

      const onlinesStat = await this.getOnlinesInbounds(server.id);

      // Step 2: Upsert stats (critical operation)
      const statsWithServerId = updatedClientStats
        .map((s) => {
          const serverId = allServers.find(
            (inAllServer) => s.inboundId === inAllServer.inboundId && inAllServer.domain === server.domain,
          )?.id;

          if (serverId) {
            return { ...s, serverId };
          }

          return null;
        })
        .filter(Boolean) as Array<Stat & { serverId: string }>;
      await this.upsertClientStats(statsWithServerId, onlinesStat);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isNetworkError =
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('ENOTFOUND');

      // Retry on network errors only
      if (isNetworkError && retryCount < MAX_RETRIES) {
        this.logger.warn(`Retrying server ${server.domain} (attempt ${retryCount + 1}/${MAX_RETRIES})`, {
          error: errorMessage,
        });

        // Exponential backoff: 2s, 4s
        await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** retryCount));

        return this.syncSingleServer(server, allServers, retryCount + 1);
      }

      // Re-throw to be caught by parent
      throw error;
    }
  }

  @Interval('syncClientStats', 1 * 60 * 1000)
  async syncClientStats() {
    const isDev = this.configService.get('env') === 'development';

    if (isDev) {
      return;
    }

    this.logger.debug('SyncClientStats called every 1 min');

    let servers: Server[] = [];
    const syncStartTime = Date.now();
    const results = {
      success: 0,
      failed: 0,
      errors: [] as Array<{ serverId: string; domain: string; error: string }>,
    };

    try {
      servers = await this.prisma.server.findMany({ where: { deletedAt: null } });
    } catch (error) {
      this.logger.error('Critical: Failed to fetch servers from database', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      return; // Exit early if we can't fetch servers
    }

    if (servers.length === 0) {
      this.logger.debug('No servers to sync');

      return;
    }

    const uniqueServers = uniqByKeys(servers, ['domain']);
    this.logger.debug(`Processing ${uniqueServers.length} unique servers`);

    const queue = new PQueue({ concurrency: 3, interval: 1000, intervalCap: 3 });

    for (const server of uniqueServers) {
      await queue.add(async () => {
        const serverStartTime = Date.now();

        try {
          // Wrap in timeout protection (30 seconds max per server)
          await Promise.race([
            this.syncSingleServer(server, servers),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Server sync timeout')), 30_000)),
          ]);

          results.success++;
        } catch (error) {
          results.failed++;
          const errorMessage = error instanceof Error ? error.message : String(error);

          results.errors.push({
            serverId: server.id,
            domain: server.domain,
            error: errorMessage,
          });

          this.logger.error(`Error syncing ClientStats for server: ${server.domain}, inboundId: ${server.inboundId}`, {
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
            serverId: server.id,
            duration: Date.now() - serverStartTime,
          });
        }
      });
    }

    await queue.onIdle();

    const totalDuration = Date.now() - syncStartTime;
    const failureRate = results.failed / uniqueServers.length;

    // Single comprehensive summary log
    if (results.failed === 0) {
      this.logger.log(`Sync complete: ${results.success}/${uniqueServers.length} servers (${totalDuration}ms)`);
    } else if (failureRate > 0.3) {
      this.logger.warn(
        `Sync complete with HIGH failure rate: ${results.success}/${uniqueServers.length} servers (${totalDuration}ms)`,
        { errors: results.errors },
      );
    } else {
      this.logger.log(
        `Sync complete: ${results.success}/${uniqueServers.length} servers, ${results.failed} failed (${totalDuration}ms)`,
      );
    }
  }

  @Interval('getServersStats', 60 * 60 * 1000)
  async getServersStats() {
    const isDev = this.configService.get('env') === 'development';

    if (isDev) {
      return;
    }

    this.logger.debug('getServersStats called every hour');

    const servers = await this.prisma.server.findMany({
      where: { deletedAt: null, category: { not: null } },
    });

    const queue = new PQueue({ concurrency: 5, interval: 1000, intervalCap: 5 });

    for (const server of servers) {
      await queue.add(async () => {
        try {
          // fetch the latest stat
          const { data } = await this.xuiClientService.authenticatedReq<{ obj: ServerStat }>({
            serverId: server.id,
            url: (domain) => this.xuiClientService.getEndpoints(domain).serverStatus,
            method: 'post',
          });

          // build new stat entry (add a timestamp if you'd like)
          const newStat: Prisma.JsonValue = {
            netTraffic: data.obj.netTraffic,
            timestamp: new Date().toISOString(),
          };

          // get existing stats array
          const currentStats = Array.isArray(server.stats) ? server.stats : [];

          // append and trim to last 168 entries
          const updatedStats = [...currentStats, newStat].slice(-168);

          // persist back
          await this.prisma.server.update({
            where: { id: server.id },
            data: { stats: updatedStats },
          });
        } catch (error) {
          this.logger.error(`Error getting server stats for ${server.id}`, error);
        }
      });
    }

    await queue.onIdle();
  }

  @Interval('setActiveServers', 120 * 60 * 1000)
  async setActiveServers() {
    const isDev = this.configService.get('env') === 'development';

    if (isDev) {
      return;
    }

    this.logger.debug('setActiveServers called every 2 hours');

    const categories: Record<string, Server[]> = {};
    const servers = await this.prisma.server.findMany({ where: { deletedAt: null, category: { not: null } } });

    for (const server of servers) {
      if (!server.category) {
        continue;
      }

      if (!categories[server.category]) {
        categories[server.category] = [];
      }

      categories[server.category].push(server);
    }

    let message = '#STATS Last 24 hours\n';

    for (const category of Object.keys(categories)) {
      const currentServers = categories[category];
      const serverDic = arrayToDic(currentServers);

      const allServers = currentServers
        .filter((s) => Boolean(s.category))
        .map((server) => ({
          id: server.id,
          server,
          samples: server.stats as unknown as NetStatSample[],
        }));

      const weights = suggestWeights(allServers, '24h');

      await this.prisma.activeServer.upsert({
        where: { category: category as PackageCategory },
        update: { activeServerId: weights[0].id },
        create: { category: category as PackageCategory, activeServerId: weights[0].id },
      });

      if (message !== '#STATS Last 24 hours\n') {
        message += '\n\n';
      }

      message += `${category}:\n`;

      weights.forEach((w) => {
        message += `${extractSubdomain(serverDic[w.id].domain)} => ${(w.usage / 1e9).toFixed(0)}GB\n`;
      });
    }

    const brandId = 'da99bcd1-4a96-416f-bc38-90c5b363573e';
    const reportGroupId = (await this.prisma.brand.findUniqueOrThrow({ where: { id: brandId } })).reportGroupId!;

    const bot = this.telegramService.getBot(brandId);
    await TelegramErrorHandler.safeTelegramCall(
      () => bot.telegram.sendMessage(reportGroupId, message),
      'Send server switch notification to report group',
      reportGroupId,
    );
  }
}
