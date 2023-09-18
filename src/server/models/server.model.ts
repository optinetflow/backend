import 'reflect-metadata';

import { Field, ObjectType, registerEnumType } from '@nestjs/graphql';
import { DomainState, ServerCountry } from '@prisma/client';

import { BaseModel } from '../../common/models/base.model';

registerEnumType(ServerCountry, {
  name: 'ServerCountry',
  description: 'ServerCountry',
});

@ObjectType()
export class Server extends BaseModel {
  @Field()
  domain: string;

  @Field()
  ip: string;

  @Field(() => ServerCountry)
  type: ServerCountry;

  @Field(() => String, { nullable: true })
  token?: string | null;
}
