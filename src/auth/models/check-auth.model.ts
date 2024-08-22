import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class CheckAuth {
  @Field(() => Boolean)
  loggedIn: boolean;
}
