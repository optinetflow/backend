import 'reflect-metadata';

import { Field, Int, ObjectType } from '@nestjs/graphql';

import { BaseModel } from '../../common/models/base.model';

@ObjectType()
export class Payment extends BaseModel {
  @Field(() => Int)
  amount: number;
}
