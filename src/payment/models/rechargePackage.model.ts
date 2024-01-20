import 'reflect-metadata';

import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

import { BaseModel } from '../../common/models/base.model';

@ObjectType()
export class RechargePackage extends BaseModel {
  @Field(() => Float)
  amount: number;

  @Field(() => Float)
  discountPercent: number;
}
