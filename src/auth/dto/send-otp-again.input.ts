import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, Matches } from 'class-validator';

@InputType()
export class SendOtpAgainInput {
  @Field()
  @IsNotEmpty()
  domainName: string;

  @Field({ nullable: true })
  @Matches(/^9\d{9}$/)
  @IsOptional()
  phone?: string;
}
