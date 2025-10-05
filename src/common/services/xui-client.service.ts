import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server } from '@prisma/client';
import { AxiosRequestConfig } from 'axios';
import * as Cookie from 'cookie';
import https from 'https';
import { PrismaService } from 'nestjs-prisma';
import { firstValueFrom } from 'rxjs';

import { AuthenticatedReq } from '../../xui/xui.types';
import { errors } from '../errors';
import { isSessionExpired, withRetries } from '../helpers';

@Injectable()
export class XuiClientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  getEndpoints(domain: string) {
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
  }

  async login(domain: string): Promise<string> {
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
            timeout: 10_000, // 10 seconds for login
            httpsAgent: new https.Agent({
              rejectUnauthorized: false,
            }),
          },
        ),
      );
      const cookie = login?.headers['set-cookie']?.[1] || login?.headers['set-cookie']?.[0];

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

  async authenticatedReq<T>({ serverId, url, method, body, headers, isBuffer, retries = 10 }: AuthenticatedReq) {
    return withRetries(async () => {
      const [auth, server] = await this.getAuthorization(serverId);

      // Use 60s timeout for database backups (isBuffer), 15s for regular operations
      const timeoutMs = isBuffer ? 60_000 : 15_000;

      const config: AxiosRequestConfig = {
        headers: { ...(headers || {}), cookie: auth },
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
        timeout: timeoutMs,
        maxContentLength: 10_485_760,
        ...(isBuffer && { responseType: 'arraybuffer' }),
      };

      return firstValueFrom(
        method === 'get'
          ? this.httpService.get<T>(url(server.domain), config)
          : this.httpService[method]<T>(url(server.domain), body, config),
      );
    }, retries);
  }

  async deleteClient(clientStatId: string) {
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
}
