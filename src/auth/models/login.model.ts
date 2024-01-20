import { Field, ObjectType } from '@nestjs/graphql';

import { User } from '../../users/models/user.model';
import { Token } from './token.model';

@ObjectType()
export class Login {
  @Field(() => Token)
  tokens: Token;

  @Field(() => User)
  user: User;
}
