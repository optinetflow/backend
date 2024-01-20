import 'reflect-metadata';

import { Field, Float, HideField, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

import { BigNumberScalar } from '../../common/scalars/bigNumber';

@ObjectType()
export class TelegramUser {
  @Field(() => BigNumberScalar)
  id: bigint;

  @Field()
  firstname: string;

  @Field()
  lastname: string;

  @Field(() => String, { nullable: true })
  phone?: string | null;

  @Field(() => String, { nullable: true })
  username?: string | null;

  @Field(() => String, { nullable: true })
  bigAvatar?: string | null;

  @Field(() => String, { nullable: true })
  smallAvatar?: string | null;
}
