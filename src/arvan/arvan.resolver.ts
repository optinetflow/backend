import { NotAcceptableException, UseGuards } from '@nestjs/common';
import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { PrismaService } from 'nestjs-prisma';

import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { UserEntity } from '../common/decorators/user.decorator';
import { User } from '../users/models/user.model';
import { ArvanService } from './arvan.service';
import { CreateArvanAccountInput } from './dto/createArvanAccount.input';
import { CreateDomainInput } from './dto/createDomain.input';
import { DomainsFiltersInput } from './dto/domainsFilters.input';
import { UpdateDnsIpInput } from './dto/updateDnsIp.input';
import { UpdateDnsPortInput } from './dto/updateDnsPort.input';
import { Arvan } from './models/arvan.model';
import { Dns } from './models/dns.model';
import { Domain } from './models/domain.model';

@Resolver()
@UseGuards(GqlAuthGuard)
export class ArvanResolver {
  constructor(private arvanService: ArvanService, private prisma: PrismaService) {}

  // @Query(() => User)
  // me(@UserEntity() user: User): User {
  //   return user;
  // }

  @UseGuards(GqlAuthGuard)
  @Query(() => [Domain])
  async domains(
    @UserEntity() _user: User,
    @Args('filters', { nullable: true }) filters?: DomainsFiltersInput,
  ): Promise<Domain[]> {
    return this.arvanService.getDomains(filters);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Domain)
  async addDomain(@UserEntity() _user: User, @Args('data') data: CreateDomainInput): Promise<Domain> {
    const arvanAccount = await this.prisma.arvan.findFirst({ where: { email: data.arvanAccount } });

    if (!arvanAccount) {
      throw new NotAcceptableException('Arvan account not found!');
    }

    const next11Month = new Date();
    next11Month.setMonth(next11Month.getMonth() + 11);

    return this.arvanService.addDomain(data.domain, next11Month, arvanAccount.id);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Dns)
  async updatePort(@UserEntity() _user: User, @Args('data') data: UpdateDnsPortInput): Promise<Dns> {
    return this.arvanService.updateDnsRecordPort(data.domain, data.port);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => [Dns])
  async updateIp(@UserEntity() _user: User, @Args('data') data: UpdateDnsIpInput): Promise<Dns[]> {
    return this.arvanService.updateDnsRecordIp(data.domain, data.ip);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Arvan)
  addArvanAccount(@UserEntity() _user: User, @Args('data') data: CreateArvanAccountInput): Promise<Arvan> {
    return this.arvanService.createArvanAccount(data);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Boolean)
  updateNsStates(@UserEntity() _user: User): boolean {
    void this.arvanService.updateNsStates();

    return true;
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Boolean)
  updateArvanSslStates(@UserEntity() _user: User): boolean {
    void this.arvanService.updateArvanSslStates();

    return true;
  }
}
