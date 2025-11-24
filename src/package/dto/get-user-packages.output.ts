import 'reflect-metadata';

import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Country, PackageCategory } from '@prisma/client';

import { BaseModel } from '../../common/models/base.model';
import { BigNumberScalar } from '../../common/scalars/bigNumber';

registerEnumType(Country, {
  name: 'Country',
  description: 'Country',
});

@ObjectType()
export class UserPackageOutput extends BaseModel {
  @Field()
  name: string;

  @Field()
  link: string;

  @Field(() => BigNumberScalar)
  remainingTraffic: bigint;

  @Field(() => BigNumberScalar)
  totalTraffic: bigint;

  @Field(() => BigNumberScalar)
  expiryTime: bigint;

  @Field(() => Date, { nullable: true })
  lastConnectedAt?: Date | null;

  @Field(() => PackageCategory)
  category: PackageCategory;

  @Field(() => String, { nullable: true })
  categoryFa?: string;

  @Field(() => Boolean)
  isFree: boolean;

  @Field(() => Int, { nullable: true })
  bundleGroupSize?: number;

  @Field(() => Country)
  country: Country;
}
