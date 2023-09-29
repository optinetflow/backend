import 'reflect-metadata';

import { Field, Float, ObjectType } from '@nestjs/graphql';

import { BaseModel } from '../../common/models/base.model';
import { BigNumberScalar } from '../../common/scalars/bigNumber';

@ObjectType()
export class ClientStat extends BaseModel {
  @Field(() => BigNumberScalar)
  total: bigint;

  @Field(() => BigNumberScalar)
  up: bigint;

  @Field(() => BigNumberScalar)
  down: bigint;

  @Field()
  email: string;

  @Field(() => Boolean)
  enable: boolean;

  @Field(() => BigNumberScalar)
  expiryTime: bigint;
}
