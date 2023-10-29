import 'reflect-metadata';

import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { DomainState } from '@prisma/client';

import { BaseModel } from '../../common/models/base.model';

export enum UpstreamHttps {
  https = 'https',
  http = 'http',
  default = 'default',
  auto = 'auto',
}

registerEnumType(UpstreamHttps, {
  name: 'UpstreamHttps',
  description: 'Upstream Https',
});
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

  @Field(() => UpstreamHttps)
  upstream_https: UpstreamHttps;
}
