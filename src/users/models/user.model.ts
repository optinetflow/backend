import 'reflect-metadata';

import { Field, Float, HideField, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Role } from '@prisma/client';
import { IsMobilePhone } from 'class-validator';

import { BaseModel } from '../../common/models/base.model';
import { TelegramUser } from '../../telegram/models/telegramUser.model';

registerEnumType(Role, {
  name: 'Role',
  description: 'User role',
});
@ObjectType()
export class ParentTelegram {
  @Field(() => String, { nullable: true })
  username?: string | null;
}

@ObjectType()
export class BankCard {
  @Field()
  name: string;

  @Field()
  number: string;
}

@ObjectType()
export class Parent {
  @Field()
  id: string;

  @Field(() => ParentTelegram, { nullable: true })
  telegram?: ParentTelegram | null;

  @Field(() => [BankCard], { nullable: true })
  bankCard?: BankCard[] | null;
}

@ObjectType()
export class User extends BaseModel {
  @Field()
  @IsMobilePhone()
  phone: string;

  @Field(() => String)
  firstname: string;

  @Field(() => String)
  lastname: string;

  @Field(() => Role)
  role: Role;

  @HideField()
  password: string;

  @Field(() => Float)
  balance: number;

  @Field(() => Float)
  profitBalance: number;

  @Field(() => Float)
  totalProfit: number;

  @Field(() => String, { nullable: true })
  parentId?: string | null;

  @Field(() => String, { nullable: true })
  referId?: string | null;

  @Field(() => Boolean, { nullable: true })
  isDisabled?: boolean | null;

  @Field(() => Boolean, { nullable: true })
  isParentDisabled?: boolean | null;

  @Field(() => TelegramUser, { nullable: true })
  telegram?: TelegramUser | null;

  @Field(() => Parent, { nullable: true })
  parent?: Parent | null;

  @Field(() => Float, { nullable: true })
  maxRechargeDiscountPercent?: number | null;

  @Field(() => [BankCard], { nullable: true })
  bankCard?: BankCard[] | null;
}
