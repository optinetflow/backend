import 'reflect-metadata';

import { Field, ObjectType } from '@nestjs/graphql';

import { BaseModel } from '../../common/models/base.model';
import { BigNumberScalar } from '../../common/scalars/bigNumber';
import { PackageCategory } from '@prisma/client';

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

  @Field(() => String, {nullable: true})
  categoryFa?: string;
}
