import 'reflect-metadata';

import { Field, ObjectType, registerEnumType } from '@nestjs/graphql';
import { DomainState } from '@prisma/client';

import { BaseModel } from '../../common/models/base.model';

registerEnumType(DomainState, {
  name: 'DomainState',
  description: 'Domain state',
});

@ObjectType()
export class Arvan extends BaseModel {
  @Field()
  email: string;

  @Field()
  password: string;

  @Field(() => [String])
  nsKeys: string[];

  @Field(() => String, { nullable: true })
  token?: string | null;

  @Field(() => Date, { nullable: true })
  tokenExpiredAt?: Date | null;
}
