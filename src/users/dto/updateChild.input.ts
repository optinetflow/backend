import { Field, InputType } from '@nestjs/graphql';
import { IsOptional, Matches } from 'class-validator';

@InputType()
export class UpdateChildInput {
  @Field()
  childId: string;

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

  @Field(() => Boolean, { nullable: true })
  isDisabled?: boolean;
}
