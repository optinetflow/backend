import { UseGuards } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';

import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { GetClientStatsFiltersInput } from './dto/getClientStatsFilters.input';
import { ClientStat } from './models/clientStat.model';
import { XuiService } from './xui.service';

@Resolver()
export class XuiResolver {
  constructor(private xuiService: XuiService) {}

  @UseGuards(GqlAuthGuard)
  @Query(() => [ClientStat])
  clientStats(@Args('filters') filter: GetClientStatsFiltersInput): Promise<ClientStat[]> {
    return this.xuiService.getClientStats(filter);
  }
}
