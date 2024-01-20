import { Field, InputType } from '@nestjs/graphql';
import { IsOptional, IsUUID } from 'class-validator';

@InputType()
export class GetClientStatsFiltersInput {
  @Field(() => String, { nullable: true })
  @IsUUID()
  @IsOptional()
  id?: string;

  @Field(() => String, { nullable: true })
  email?: string;
}
