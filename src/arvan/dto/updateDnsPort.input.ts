import { Field, InputType } from '@nestjs/graphql';
import { Matches } from 'class-validator';

@InputType()
export class UpdateDnsPortInput {
  @Field()
  @Matches(/^[\dA-Za-z][\dA-Za-z-]{1,61}[\dA-Za-z]\.[A-Za-z]{1,10}$/)
  domain: string;

  @Field()
  port: string;
}
