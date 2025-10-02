import { Injectable, NotAcceptableException } from '@nestjs/common';
import { PackageCategory, Server } from '@prisma/client';
import { PrismaService } from 'nestjs-prisma';

import { Package } from '../../package/models/package.model';
import { User } from '../../users/models/user.model';

@Injectable()
export class ServerManagementService {
  constructor(private readonly prisma: PrismaService) {}

  async getFreeServer(user: User, pack: Package): Promise<Server> {
    if (!user.brandId) {
      throw new NotAcceptableException('Brand is not found for this user');
    }

    const activeServer = await this.prisma.activeServer.findFirst({
      where: {
        category: pack.category,
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
}
