import { NotAcceptableException, UseGuards } from '@nestjs/common';
import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { PrismaService } from 'nestjs-prisma';

import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { UserEntity } from '../common/decorators/user.decorator';
import { User } from '../users/models/user.model';
import { CreateServerInput } from './dto/createServer.input';
import { IssueCertInput } from './dto/issueCert.input';
import { Server } from './models/server.model';
import { ServerService } from './server.service';

@Resolver()
@UseGuards(GqlAuthGuard)
export class ServerResolver {
  constructor(private serverService: ServerService, private prisma: PrismaService) {}

  // @Query(() => User)
  // me(@UserEntity() user: User): User {
  //   return user;
  // }

  // @UseGuards(GqlAuthGuard)
  // @Mutation(() => Domain)
  // issueCert(@UserEntity() _user: User, @Args('data') data: IssueCertInput): Promise<Domain> {
  //   return this.serverService.issueCert(data);
  // }

  // @UseGuards(GqlAuthGuard)
  // @Mutation(() => Server)
  // addServer(@UserEntity() _user: User, @Args('data') data: CreateServerInput): Promise<Server> {
  //   return this.serverService.createServer(_user, data);
  // }

  // @UseGuards(GqlAuthGuard)
  // @Mutation(() => Boolean)
  // updateLetsEncryptSslStates(@UserEntity() _user: User): boolean {
  //   void this.serverService.updateLetsEncryptSslStates();

  //   return true;
  // }
}
