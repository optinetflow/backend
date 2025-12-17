import { Field, InputType } from '@nestjs/graphql';
import { Country } from '../../generated/prisma/client';
import { IsOptional, IsUUID } from 'class-validator';

@InputType()
export class BuyPackageInput {
  @Field()
  @IsUUID()
  packageId: string;

  @Field()
  name?: string;

  @Field(() => String, { nullable: true })
  @IsUUID()
  @IsOptional()
  receipt?: string;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  bundleGroupSize?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  durationMonths?: number;

  @Field(() => Country)
  country: Country;
}
