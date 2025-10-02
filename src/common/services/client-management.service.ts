import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { PrismaService } from 'nestjs-prisma';
import PQueue from 'p-queue';
import { v4 as uuid } from 'uuid';

import { Package } from '../../package/models/package.model';
import { CreatePackageInput } from '../../package/package.types';
import { User } from '../../users/models/user.model';
import { AddClientInput, UpdateClientReqInput } from '../../xui/xui.types';
import { errors } from '../errors';
import { jsonObjectToQueryString, roundTo } from '../helpers';
import { XuiClientService } from './xui-client.service';

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

@Injectable()
export class ClientManagementService {
  constructor(private readonly prisma: PrismaService, private readonly xuiClientService: XuiClientService) {}

  async addClient(_user: User, input: AddClientInput[]): Promise<void> {
    const clients: ClientInput[] = [];
    const server = await this.prisma.server.findUniqueOrThrow({ where: { id: input[0].serverId } });

    for (const client of input) {
      const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);
      const email = client?.email || nanoid();
      const id = client?.id || uuid();
      const subId = client?.subId || nanoid();

      clients.push({
        id,
        flow: '',
        email,
        limitIp: client.package.userCount,
        totalGB: 1024 * 1024 * 1024 * client.package.traffic,
        expiryTime: Date.now() + 24 * 60 * 60 * 1000 * client.package.expirationDays,
        enable: true,
        tgId: '',
        reset: 0,
        comment: '',
        subId,
      });
    }

    const jsonData = {
      id: server.inboundId,
      settings: {
        clients,
      },
    };

    const params = jsonObjectToQueryString(jsonData);

    const res = await this.xuiClientService.authenticatedReq<{ success: boolean }>({
      serverId: input[0].serverId,
      url: (domain) => this.xuiClientService.getEndpoints(domain).addClient,
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
            id: input?.id || clientStat.id,
            flow: clientStat.flow,
            email: clientStat.email,
            limitIp: input?.limitIp || clientStat.limitIp,
            totalGB: input?.totalGB || Number(clientStat.total),
            expiryTime: input?.expiryTime || Number(clientStat.expiryTime),
            enable: input?.enable || clientStat.enable,
            tgId: clientStat.tgId,
            subId: clientStat.subId,
            reset: 0,
            comment: '',
          },
        ],
      },
    };

    const params = jsonObjectToQueryString(jsonData);

    const res = await this.xuiClientService.authenticatedReq<{ success: boolean }>({
      serverId: clientStat.server.id,
      url: (domain) => this.xuiClientService.getEndpoints(domain).updateClient(clientStat.id),
      method: 'post',
      body: params,
    });

    if (!res.data.success) {
      throw new BadRequestException(errors.xui.updateClientError);
    }
  }

  async toggleClientState(clientId: string, state: boolean) {
    await this.updateClientReq({
      id: clientId,
      enable: state,
    });
  }

  async toggleUserBlock(userId: string, isBlocked: boolean): Promise<void> {
    const [userPacks, children] = await Promise.all([
      this.prisma.userPackage.findMany({
        where: {
          userId,
          finishedAt: null,
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
        finishedAt: null,
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
            bundleGroupSize: input?.bundleGroupSize,
            bundleGroupKey: input?.bundleGroupKey,
          },
        }),
      ];
    } catch (error) {
      console.error(error);

      throw new BadRequestException('upsert client Stat or create userPackage got failed.');
    }
  }
}
