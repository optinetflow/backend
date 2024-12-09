import { Field, ObjectType } from '@nestjs/graphql';

import { Child } from '../models/user.model';

@ObjectType()
export class GetChildrenBySegmentOutput {
  @Field(() => [Child])
  engagedSubscribers?: Child[];

  @Field(() => [Child])
  dormantSubscribers?: Child[];

  @Field(() => [Child])
  longLostCustomers?: Child[];

  @Field(() => [Child])
  recentlyLapsedCustomers?: Child[];

  @Field(() => [Child])
  newProspects?: Child[];

  @Field(() => [Child])
  uncategorized?: Child[];
}
