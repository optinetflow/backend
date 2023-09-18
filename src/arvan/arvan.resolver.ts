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
  constructor(private arvanService: ArvanService, private prisma: PrismaService) {}

  // @Query(() => User)
  // me(@UserEntity() user: User): User {
  //   return user;
  // }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Domain)
  async addDomain(@UserEntity() _user: User, @Args('data') data: CreateDomainInput): Promise<Domain> {
    const arvanAccount = await this.prisma.arvan.findFirst({ where: { email: data.arvanAccount } });

    if (!arvanAccount) {
      throw new NotAcceptableException('Arvan account not found!');
    }

    return this.arvanService.addDomain(data.domain, data.expiredAt, arvanAccount.id, data.ignoreAlreadyExist);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Arvan)
  addArvanAccount(@UserEntity() _user: User, @Args('data') data: CreateArvanAccountInput): Promise<Arvan> {
    return this.arvanService.createArvanAccount(data);
  }
}
