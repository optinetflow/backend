import 'reflect-metadata';

import { Field, HideField, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Country, InboundType } from '../../generated/prisma/client';

import { Brand } from '../../brand/models/brand.model';
import { BaseModel } from '../../common/models/base.model';

registerEnumType(Country, {
  name: 'Country',
  description: 'Country',
});

registerEnumType(InboundType, {
  name: 'InboundType',
  description: 'InboundType',
});

@ObjectType()
export class Server extends BaseModel {
  @Field()
  domain: string;

  @Field()
  ip: string;

  @Field(() => Brand)
  brand: Brand;

  @Field(() => Country)
  country: Country;

  @HideField()
  token: string;

  @HideField()
  tunnelDomain: string;

  @HideField()
  inboundId: number;

  @HideField()
  inboundType: InboundType;

  @HideField()
  port: number;
}
