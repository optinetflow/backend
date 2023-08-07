import 'reflect-metadata';

import { Field, HideField, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Role } from '@prisma/client';
import { IsMobilePhone } from 'class-validator';

import { BaseModel } from '../../common/models/base.model';

registerEnumType(Role, {
  name: 'Role',
  description: 'User role',
});

@ObjectType()
export class User extends BaseModel {
  @Field()
  @IsMobilePhone()
  phone: string;

  @Field(() => String, { nullable: true })
  firstname?: string;

  @Field(() => String, { nullable: true })
  lastname?: string;

  @Field(() => Role)
  role: Role;

  @HideField()
  password: string;
}
