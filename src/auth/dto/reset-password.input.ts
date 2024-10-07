import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, Matches, MinLength } from 'class-validator';

@InputType()
export class ResetPasswordInput {
  @Field()
  @IsNotEmpty()
  @MinLength(4)
  password: string;

  @Field()
  @IsNotEmpty()
  domainName: string;

  @Field()
  @IsNotEmpty()
  otp: string;

  @Field()
  @Matches(/^9\d{9}$/)
  phone: string;
}
