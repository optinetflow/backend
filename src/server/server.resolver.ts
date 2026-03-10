import { UseGuards } from '@nestjs/common';
import { Query, Resolver } from '@nestjs/graphql';

import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { AvailableCountries } from './models/availableCountries.model';
import { ServerService } from './server.service';

@Resolver()
@UseGuards(GqlAuthGuard)
export class ServerResolver {
  constructor(private serverService: ServerService) {}

  @Query(() => [AvailableCountries])
  availableCountries(): Promise<AvailableCountries[]> {
    return this.serverService.getAvailableCountries();
  }
}
