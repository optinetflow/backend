import { NotAcceptableException, UseGuards } from '@nestjs/common';
import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { PrismaService } from 'nestjs-prisma';

import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { UserEntity } from '../common/decorators/user.decorator';
import { User } from '../users/models/user.model';
import { ServerService } from './server.service';

@Resolver()
@UseGuards(GqlAuthGuard)
export class ServerResolver {
  constructor(private serverService: ServerService, private prisma: PrismaService) {}

  private defaultServerId: string;

  // @Query(() => User)
  // me(@UserEntity() user: User): User {
  //   return user;
  // }

  // @UseGuards(GqlAuthGuard)
  // @Mutation(() => Server)
  // addServerAccount(@UserEntity() _user: User, @Args('data') data: CreateServerAccountInput): Promise<Server> {
  //   return this.serverService.createServerAccount(data);
  // }
}
