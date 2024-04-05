import { Field, InputType } from '@nestjs/graphql';
import { IsOptional, IsUUID } from 'class-validator';

@InputType()
export class BuyPackageInput {
  @Field()
  @IsUUID()
  packageId: string;

  @Field()
  name?: string;

  @Field(() => String, { nullable: true })
  @IsUUID()
  @IsOptional()
  receipt?: string;
}
