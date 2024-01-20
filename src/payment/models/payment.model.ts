import 'reflect-metadata';

import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ServerCountry } from '@prisma/client';

import { BaseModel } from '../../common/models/base.model';

@ObjectType()
export class Payment extends BaseModel {
  @Field(() => Int)
  amount: number;
}
