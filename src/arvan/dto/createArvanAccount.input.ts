import { Field, InputType } from '@nestjs/graphql';
import { IsEmail, Matches, MinLength } from 'class-validator';

@InputType()
export class CreateArvanAccountInput {
  @Field()
  @IsEmail()
  email: string;

  @Field()
  password: string;
}
