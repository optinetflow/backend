import { NotAcceptableException, UseGuards } from '@nestjs/common';
import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { PrismaService } from 'nestjs-prisma';

import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { UserEntity } from '../common/decorators/user.decorator';
import { User } from '../users/models/user.model';
import { ArvanService } from './arvan.service';
import { CreateArvanAccountInput } from './dto/createArvanAccount.input';
import { CreateDomainInput } from './dto/createDomain.input';
import { Arvan } from './models/arvan.model';
import { Domain } from './models/domain.model';

@Resolver()
@UseGuards(GqlAuthGuard)
export class ArvanResolver {
  constructor(private arvanService: ArvanService, private prisma: PrismaService) {
    void (async () => {
      const defaultArvanAccount = await this.prisma.arvan.findFirst({ where: { email: 'soheyliansara@gmail.com' } });

      if (!defaultArvanAccount?.id) {
        console.error('DefaultArvanAccount not found!');

        return;
      }

      this.defaultArvanId = defaultArvanAccount?.id;
    })();
  }

  private defaultArvanId: string;

  // @Query(() => User)
  // me(@UserEntity() user: User): User {
  //   return user;
  // }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Domain)
  addDomain(@UserEntity() _user: User, @Args('data') data: CreateDomainInput): Promise<Domain> {
    return this.arvanService.addDomain(data.domain, data.expiredAt, this.defaultArvanId);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Arvan)
  addArvanAccount(@UserEntity() _user: User, @Args('data') data: CreateArvanAccountInput): Promise<Arvan> {
    return this.arvanService.createArvanAccount(data);
  }
}
