import 'reflect-metadata';

import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Country } from '@prisma/client';

import { BaseModel } from '../../common/models/base.model';
import { BigNumberScalar } from '../../common/scalars/bigNumber';
import { Server } from '../../server/models/server.model';
import { ClientStat } from '../../xui/models/clientStat.model';
import { Package } from './package.model';

registerEnumType(Country, {
  name: 'Country',
  description: 'Country',
});

@ObjectType()
export class UserPackage extends BaseModel {
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

  @Field(() => Package)
  package: Package;

  @Field(() => ClientStat)
  stat: ClientStat;

  @Field(() => String)
  statId: string;

  @Field(() => Server)
  server: Server;

  @Field(() => Boolean)
  isFree: boolean;

  @Field(() => Int, { nullable: true })
  bundleGroupSize?: number;

  @Field(() => Country)
  country: Country;
}
