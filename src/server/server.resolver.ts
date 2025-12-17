import { UseGuards } from '@nestjs/common';
import { Query, Resolver } from '@nestjs/graphql';
import { PrismaService } from '../prisma/prisma.service';

import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { UserEntity } from '../common/decorators/user.decorator';
import { User } from '../users/models/user.model';
import { AvailableCountries } from './models/availableCountries.model';
import { ServerService } from './server.service';

@Resolver()
@UseGuards(GqlAuthGuard)
export class ServerResolver {
  constructor(private serverService: ServerService, private prisma: PrismaService) {}

  @Query(() => [AvailableCountries])
  availableCountries(): Promise<AvailableCountries[]> {
    return this.serverService.getAvailableCountries();
  }

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
