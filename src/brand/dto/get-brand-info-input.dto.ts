import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class GetBrandInfoInput {
  @Field(() => String)
  domainName: string;
}
