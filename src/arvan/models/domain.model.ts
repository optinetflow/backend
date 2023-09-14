import 'reflect-metadata';

import { Field, ObjectType, registerEnumType } from '@nestjs/graphql';
import { DomainState } from '@prisma/client';

import { BaseModel } from '../../common/models/base.model';

registerEnumType(DomainState, {
  name: 'DomainState',
  description: 'Domain state',
});

@ObjectType()
export class Domain extends BaseModel {
  @Field()
  domain: string;

  @Field(() => Date)
  expiredAt: Date;

  @Field(() => DomainState)
  nsState: DomainState;

  @Field(() => DomainState)
  arvanSslState: DomainState;

  @Field(() => DomainState)
  letsEncryptSsl: DomainState;
}
