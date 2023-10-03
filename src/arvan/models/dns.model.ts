import 'reflect-metadata';

import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { DomainState } from '@prisma/client';

import { BaseModel } from '../../common/models/base.model';

@ObjectType()
class DnsValue {
  @Field()
  ip: string;

  @Field(() => String, { nullable: true })
  port?: string | null;

  @Field(() => Int)
  weight: number;

  @Field()
  country: string;
}

@ObjectType()
export class Dns extends BaseModel {
  @Field()
  id: string;

  @Field()
  type: string;

  @Field()
  name: string;

  @Field(() => Int)
  ttl: number;

  @Field(() => Boolean)
  cloud: boolean;

  @Field(() => [DnsValue])
  value: DnsValue[];
}
