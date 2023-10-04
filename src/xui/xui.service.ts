/* eslint-disable max-len */
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { Prisma, Server } from '@prisma/client';
import * as Cookie from 'cookie';
import { PrismaService } from 'nestjs-prisma';
import { firstValueFrom } from 'rxjs';

import { errors } from '../common/errors';
import { isSessionExpired } from '../common/helpers';
import { MinioClientService } from '../minio/minio.service';
import { GetClientStatsFiltersInput } from './dto/getClientStatsFilters.input';
import { ClientStat } from './models/clientStat.model';

interface AuthenticatedReq {
  serverId: string;
  url: (domain: string) => string;
  method: 'post' | 'get' | 'patch' | 'put';
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}

interface InboundSetting {
  clients: Array<{
    id: string;
    email: string;
    limitIp: number;
    totalGB: number;
    expiryTime: number;
  }>;
}

interface InboundStreamSettings {
  network: string;
  security: string;
  tlsSettings: {
    serverName: string;
    minVersion: string;
    maxVersion: string;
    certificates: Array<{
      certificateFile: string;
      keyFile: string;
    }>;
  };
}

interface InboundClientStat {
  id: number;
  inboundId: number;
  enable: boolean;
  email: string;
  up: number;
  down: number;
  total: number;
  expiryTime: number;
}

interface InboundListRes {
  obj: Array<{
    id: number;
    up: number;
    down: number;
    total: number;
    remark: string;
    enable: boolean;
    expiryTime: number;
    port: number;
    protocol: string;
    settings: string;
    streamSettings: string;
    tag: string;
    sniffing: string;
    clientStats: InboundClientStat[];
  }>;
}
interface Stat {
  id: string;
  port: number;
  inboundId: number;
  enable: boolean;
  email: string;
  up: number;
  down: number;
  total: number;
  expiryTime: number;
}

const ENDPOINTS = (domain: string) => {
  const url = `https://v.${domain}/v`;

  return {
    login: `${url}/login`,
    inbounds: `${url}/xui/inbound/list`,
  };
};

@Injectable()
export class XuiService {
  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly minioService: MinioClientService,
  ) {}

  private readonly logger = new Logger(XuiService.name);

  async login(domain: string): Promise<string> {
    try {
      const login = await firstValueFrom(
        this.httpService.post<{ success: boolean }>(ENDPOINTS(domain).login, 'username=mamad&password=mamad', {
          headers: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
        }),
      );
      const cookie = login?.headers['set-cookie']?.[0];

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
    const server = await this.prisma.server.findUniqueOrThrow({ where: { id: serverId } });

    if (!isSessionExpired(server.token)) {
      return [`session=${Cookie.parse(server.token).session}`, server];
    }

    const token = await this.login(server.domain);

    await this.prisma.server.update({
      where: {
        id: serverId,
      },
      data: {
        token,
      },
    });

    return [`session=${Cookie.parse(token).session}`, server];
  }

  async authenticatedReq<T>({ serverId, url, method, body, headers }: AuthenticatedReq) {
    const [auth, server] = await this.getAuthorization(serverId);

    const config = { headers: { ...(headers || {}), cookie: auth } };

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
          id: setting.clients.filter((i) => i.id).find((client) => client.email === stat.email)?.id || '',
          port: item.port,
        })),
      );
    });

    return clientStats.filter((i) => i.id);
  }

  async upsertClientStats(stats: Stat[], serverId: string) {
    if (stats.length === 0) {
      return; // Nothing to upsert
    }

    const updatedValues = stats.map(
      (stat) =>
        Prisma.sql`(${stat.id}, ${stat.enable}, ${stat.email}, ${stat.up}, ${stat.down}, ${stat.total}, ${
          stat.expiryTime
        }, to_timestamp(${Date.now()} / 1000.0), ${serverId})`,
    );

    try {
      await this.prisma.$queryRaw`
        INSERT INTO "ClientStat"  (id, "enable", email, up, down, total, "expiryTime", "updatedAt", "serverId")
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
          "serverId" = EXCLUDED."serverId"

      `;
    } catch (error) {
      console.error('Error upserting ClientStats:', error);
    }
  }

  async getClientStats(filters?: GetClientStatsFiltersInput): Promise<ClientStat[]> {
    try {
      return this.prisma.clientStat.findMany({
        where: {
          ...(filters?.id && {
            id: {
              contains: filters.id,
            },
          }),
          ...(filters?.email && {
            email: {
              contains: filters.email,
            },
          }),
        },
      });
    } catch {
      throw new BadRequestException('Get ClientStats failed.');
    }
  }

  @Interval('syncClientStats', 1 * 60 * 1000)
  async syncClientStats() {
    this.logger.debug('SyncClientStats called every 1 min');
    const servers = await this.prisma.server.findMany();

    for (const server of servers) {
      try {
        const updatedClientStats = await this.getInbounds(server.id);

        // Upsert ClientStat records in bulk
        await this.upsertClientStats(updatedClientStats, server.id);
      } catch (error) {
        console.error(`Error syncing ClientStats for server: ${server.id}`, error);
      }
    }
  }
}
