import { Field, ObjectType } from '@nestjs/graphql';

import { User } from '../../users/models/user.model';
import { Token } from './token.model';

@ObjectType()
export class LoginData {
  @Field(() => Token)
  tokens: Token;

  @Field(() => User)
  user: User;
}

@ObjectType()
export class Login {
  @Field(() => LoginData, { nullable: true })
  loggedIn?: LoginData | null;

  @Field(() => Boolean, { nullable: true })
  isPromoCodeValid?: boolean;
}
