import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, Matches } from 'class-validator';

@InputType()
export class UpdatePhoneInput {
  @Field()
  @IsNotEmpty()
  domainName: string;

  @Field()
  @Matches(/^9\d{9}$/)
  phone: string;
}
