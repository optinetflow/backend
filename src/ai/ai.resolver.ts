import { UseGuards } from '@nestjs/common';
import { Resolver } from '@nestjs/graphql';

import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { User } from '../users/models/user.model';
import { AiService } from './ai.service';

@Resolver()
@UseGuards(GqlAuthGuard)
export class AiResolver {
  constructor(private aiService: AiService) {}
}
