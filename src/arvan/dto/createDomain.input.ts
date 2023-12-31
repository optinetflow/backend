import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, Matches, MinLength } from 'class-validator';

@InputType()
export class CreateDomainInput {
  @Field()
  @Matches(/^[\dA-Za-z][\dA-Za-z-]{1,61}[\dA-Za-z]\.[A-Za-z]{1,10}$/)
  domain: string;

  @Field()
  arvanAccount: string;

  @Field()
  @Matches(/^[\dA-Za-z][\dA-Za-z-]{1,61}[\dA-Za-z]\.[A-Za-z]{1,10}$/)
  serverDomain: string;

  @Field(() => String, { nullable: true })
  expiredAt?: string | null;

  // @Field(() => Date, { nullable: true })
  // expiredAt?: Date | null;
}
