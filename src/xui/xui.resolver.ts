import { NotAcceptableException, UseGuards } from '@nestjs/common';
import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { PrismaService } from 'nestjs-prisma';

import { Domain } from '../arvan/models/domain.model';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { UserEntity } from '../common/decorators/user.decorator';
import { User } from '../users/models/user.model';
import { GetClientStatsFiltersInput } from './dto/getClientStatsFilters.input';
import { ClientStat } from './models/clientStat.model';
import { XuiService } from './xui.service';

@Resolver()
@UseGuards(GqlAuthGuard)
export class XuiResolver {
  constructor(private xuiService: XuiService, private prisma: PrismaService) {}

  @UseGuards(GqlAuthGuard)
  @Query(() => [ClientStat])
  clientStats(@Args('filters', { nullable: true }) filter?: GetClientStatsFiltersInput): Promise<ClientStat[]> {
    return this.xuiService.getClientStats(filter);
  }
}
