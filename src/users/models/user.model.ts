import 'reflect-metadata';

import { Field, Float, HideField, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Role } from '@prisma/client';
import { IsMobilePhone } from 'class-validator';

import { Brand } from '../../brand/models/brand.model';
import { BaseModel } from '../../common/models/base.model';
import { Package } from '../../package/models/package.model';
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
export class PromotionCode {
  @Field()
  code: string;
}

@ObjectType()
export class UserGift {
  @Field(() => Package, { nullable: true })
  giftPackage?: Package | null;

  @Field(() => Boolean)
  isGiftUsed: boolean;
}

@ObjectType()
export class Parent {
  @Field()
  id: string;

  @Field(() => ParentTelegram, { nullable: true })
  telegram?: ParentTelegram | null;

  @Field(() => [BankCard], { nullable: true })
  bankCard?: BankCard[] | null;

  @Field(() => String, { nullable: true })
  freePackageId?: string | null;
}

@ObjectType()
export class User extends BaseModel {
  @Field()
  @IsMobilePhone()
  phone: string;

  @Field(() => String)
  fullname: string;

  @Field(() => Role)
  role: Role;

  @HideField()
  password: string;

  @Field(() => Float)
  balance: number;

  @Field(() => String, { nullable: true })
  otp?: string | null;

  @Field(() => Date, { nullable: true })
  otpExpiration?: Date | null;

  @Field(() => Float)
  profitBalance: number;

  @Field(() => Float)
  totalProfit: number;

  @Field(() => String, { nullable: true })
  parentId?: string | null;

  @Field(() => String)
  brandId: string;

  @Field(() => String, { nullable: true })
  referId?: string | null;

  @Field(() => Boolean, { nullable: true })
  isDisabled?: boolean | null;

  @Field(() => Boolean)
  isVerified: boolean;

  @Field(() => Boolean, { nullable: true })
  isParentDisabled?: boolean | null;

  @Field(() => TelegramUser, { nullable: true })
  telegram?: TelegramUser | null;

  @Field(() => Brand, { nullable: true })
  brand?: Brand | null;

  @Field(() => [PromotionCode], { nullable: true })
  promotion?: PromotionCode[] | null;

  @Field(() => Parent, { nullable: true })
  parent?: Parent | null;

  @Field(() => Float, { nullable: true })
  maxRechargeDiscountPercent?: number | null;

  @Field(() => [BankCard], { nullable: true })
  bankCard?: BankCard[] | null;

  @Field(() => Float)
  profitPercent: number;

  @Field(() => Float, { nullable: true })
  initialDiscountPercent?: number | null;

  @Field(() => Float, { nullable: true })
  appliedDiscountPercent?: number | null;

  @Field(() => [UserGift], { nullable: true })
  userGift?: UserGift[] | null;
}

@ObjectType()
export class Child extends User {
  @Field(() => Int)
  activePackages: number;

  @Field(() => Int)
  onlinePackages: number;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => Date, { nullable: true })
  lastConnectedAt?: Date | null;

  @Field(() => Number)
  paymentCount: number;
}
