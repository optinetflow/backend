import 'reflect-metadata';

import { Field, ObjectType } from '@nestjs/graphql';

import { BaseModel } from '../../common/models/base.model';
import { BigNumberScalar } from '../../common/scalars/bigNumber';
import { Server } from '../../server/models/server.model';
import { ClientStat } from '../../xui/models/clientStat.model';
import { Package } from './package.model';

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
}
