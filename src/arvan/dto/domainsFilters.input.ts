import { Field, InputType } from '@nestjs/graphql';
import { DomainState } from '@prisma/client';
import { IsNotEmpty, Matches, MinLength } from 'class-validator';

@InputType()
export class DomainsFiltersInput {
  @Field(() => String, { nullable: true })
  domain?: string;

  @Field(() => DomainState, { nullable: true })
  nsState?: DomainState | null;

  @Field(() => DomainState, { nullable: true })
  arvanSslState?: DomainState | null;

  @Field(() => DomainState, { nullable: true })
  letsEncryptSsl?: DomainState | null;
}
