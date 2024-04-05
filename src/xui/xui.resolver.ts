import { ConfigService } from '@nestjs/config';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { PrismaService } from 'nestjs-prisma';

import { GetClientStatsFiltersInput } from './dto/getClientStatsFilters.input';
import { ClientStat } from './models/clientStat.model';
import { XuiService } from './xui.service';

@Resolver()
export class XuiResolver {
  constructor(
    private xuiService: XuiService,
    private readonly configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  private readonly webPanel = this.configService.get('webPanelUrl');

  // @UseGuards(GqlAuthGuard)
  @Query(() => [ClientStat])
  clientStats(@Args('filters') filter: GetClientStatsFiltersInput): Promise<ClientStat[]> {
    return this.xuiService.getClientStats(filter);
  }
}
