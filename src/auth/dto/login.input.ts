import { Field, InputType } from '@nestjs/graphql';
import { IsMobilePhone, IsNotEmpty, MinLength } from 'class-validator';

@InputType()
export class LoginInput {
  @Field()
  @IsMobilePhone()
  phone: string;

  @Field()
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}
