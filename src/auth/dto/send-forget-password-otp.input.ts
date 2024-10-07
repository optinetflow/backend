import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, Matches, MinLength } from 'class-validator';

@InputType()
export class SendForgetPasswordOtpInput {
  @Field()
  @Matches(/^9\d{9}$/)
  phone: string;

  @Field()
  @IsNotEmpty()
  domainName: string;
}
