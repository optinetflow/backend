import { Field, InputType } from '@nestjs/graphql';
import { DomainState } from '@prisma/client';
import { IsNotEmpty, Matches, MinLength } from 'class-validator';

@InputType()
export class GetClientStatsFiltersInput {
  @Field(() => String, { nullable: true })
  id?: string;

  @Field(() => String, { nullable: true })
  email?: string;
}
