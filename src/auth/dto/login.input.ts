import { Field, InputType } from '@nestjs/graphql';
import { DomainName } from '@prisma/client';
import { IsEnum, IsNotEmpty, Matches, MinLength } from 'class-validator';

@InputType()
export class LoginInput {
  @Field()
  @Matches(/^9\d{9}$/)
  phone: string;

  @Field()
  @IsNotEmpty()
  @MinLength(4)
  password: string;

  @Field(() => DomainName)
  @IsNotEmpty()
  @IsEnum(DomainName)
  domainName: DomainName;
}
