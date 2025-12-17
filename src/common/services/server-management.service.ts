import { Injectable, NotAcceptableException } from '@nestjs/common';
import { Country, PackageCategory, Server } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

import { Package } from '../../package/models/package.model';
import { User } from '../../users/models/user.model';

@Injectable()
export class ServerManagementService {
  constructor(private readonly prisma: PrismaService) {}

  async getFreeServer(user: User, pack: Package, country: Country): Promise<Server> {
    if (!user.brandId) {
      throw new NotAcceptableException('Brand is not found for this user');
    }

    const activeServer = await this.prisma.activeServer.findFirst({
      where: {
        category: pack.category,
        country,
      },
      include: {
        server: true,
      },
    });

    if (!activeServer?.server) {
      throw new NotAcceptableException(
        `No active server found for brand ${user.brandId}, category ${pack.category}, and country ${country}`,
      );
    }

    return activeServer.server;
  }
}
