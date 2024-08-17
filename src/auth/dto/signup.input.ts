import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, Matches, MinLength } from 'class-validator';

@InputType()
export class SignupInput {
  @Field()
  fullname: string;

  @Field()
  @Matches(/^9\d{9}$/)
  phone: string;

  @Field()
  @IsNotEmpty()
  @MinLength(4)
  password: string;

  @Field(() => String, { nullable: true })
  promoCode?: string;
}
