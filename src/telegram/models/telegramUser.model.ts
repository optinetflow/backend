import 'reflect-metadata';

import { Field, ObjectType } from '@nestjs/graphql';

import { BaseModel } from '../../common/models/base.model';
import { BigNumberScalar } from '../../common/scalars/bigNumber';

@ObjectType()
export class TelegramUser extends BaseModel {
  @Field(() => BigNumberScalar, { nullable: true })
  chatId?: bigint | null;

  @Field(() => String, { nullable: true })
  firstname?: string | null;

  @Field(() => String, { nullable: true })
  lastname?: string | null;

  @Field(() => String, { nullable: true })
  phone?: string | null;

  @Field(() => String, { nullable: true })
  username?: string | null;

  @Field(() => String, { nullable: true })
  bigAvatar?: string | null;

  @Field(() => String, { nullable: true })
  smallAvatar?: string | null;
}
