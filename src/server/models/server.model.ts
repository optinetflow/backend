import 'reflect-metadata';

import { Field, HideField, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ServerCountry } from '@prisma/client';

import { Brand } from '../../brand/models/brand.model';
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

  @Field(() => Brand)
  brand: Brand;

  @Field(() => ServerCountry)
  type: ServerCountry;

  @HideField()
  token: string;

  @HideField()
  tunnelDomain: string;

  @HideField()
  inboundId: number;

  @HideField()
  port: number;
}
