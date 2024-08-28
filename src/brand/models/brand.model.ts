import { Field, ObjectType } from '@nestjs/graphql';

import { BaseModel } from '../../common/models/base.model';

@ObjectType()
export class Brand extends BaseModel {
  @Field(() => String)
  domainName: string;

  @Field(() => String)
  title: string;

  @Field(() => String)
  description: string;

  @Field(() => String)
  botToken: string;

  @Field(() => String)
  botUsername: string;

  @Field(() => String, { nullable: true })
  reportGroupId?: string | null;
}
