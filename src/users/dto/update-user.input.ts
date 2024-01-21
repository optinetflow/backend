import { Field, InputType } from '@nestjs/graphql';
import { IsOptional, Matches } from 'class-validator';

@InputType()
export class UpdateUserInput {
  @Field(() => String, { nullable: true })
  firstname?: string;

  @Field(() => String, { nullable: true })
  lastname?: string;

  @Field(() => String, { nullable: true })
  @Matches(/^9\d{9}$/)
  @IsOptional()
  phone?: string;

  @Field(() => String, { nullable: true })
  password?: string;

  @Field(() => String, { nullable: true })
  cardBandNumber?: string;

  @Field(() => String, { nullable: true })
  cardBandName?: string;
}
