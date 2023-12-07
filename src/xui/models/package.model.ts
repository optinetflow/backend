import 'reflect-metadata';

import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

import { BaseModel } from '../../common/models/base.model';

@ObjectType()
export class Package extends BaseModel {
  @Field(() => Float)
  traffic: number;

  @Field(() => Int)
  expirationDays: number;

  @Field(() => Int)
  price: number;

  @Field(() => Int)
  userCount: number;
}
