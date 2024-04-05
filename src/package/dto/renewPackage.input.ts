import { Field, InputType } from '@nestjs/graphql';
import { IsOptional, IsUUID } from 'class-validator';

@InputType()
export class RenewPackageInput {
  @Field()
  @IsUUID()
  packageId: string;

  @Field()
  userPackageId?: string;

  @Field(() => String, { nullable: true })
  @IsUUID()
  @IsOptional()
  receipt?: string;
}
