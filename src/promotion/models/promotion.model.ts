import { Field, ID, ObjectType } from '@nestjs/graphql';

import { BaseModel } from '../../common/models/base.model';
import { Package } from '../../package/models/package.model';
import { User } from '../../users/models/user.model';

@ObjectType()
export class Promotion extends BaseModel {
  @Field(() => ID)
  id: string;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date | null;

  @Field()
  code: string;

  @Field(() => User)
  parentUser?: User;

  @Field(() => Package, { nullable: true })
  giftPackage?: Package | null;
}
