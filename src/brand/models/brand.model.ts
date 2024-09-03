import { Field, HideField, ObjectType } from '@nestjs/graphql';
import { Prisma } from '@prisma/client';
import { GraphQLJSON } from 'graphql-type-json';

import { BaseModel } from '../../common/models/base.model';

@ObjectType()
export class Brand extends BaseModel {
  @Field(() => String)
  domainName: string;

  @Field(() => String)
  title: string;

  @Field(() => String)
  description: string;

  @HideField()
  botToken: string;

  @Field(() => String)
  botUsername: string;

  @HideField()
  reportGroupId?: string | null;

  @Field(() => GraphQLJSON, { nullable: true })
  logo?: Prisma.JsonValue | null;

  @HideField()
  backupGroupId?: string | null;

  @HideField()
  activeServerId?: string | null;
}
