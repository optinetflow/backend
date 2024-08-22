import { Field, InputType, Int } from '@nestjs/graphql';
import { Role } from '@prisma/client';
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

  @Field(() => Role, { nullable: true })
  role?: Role;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => Int, { nullable: true })
  initialDiscountPercent: number;
}
