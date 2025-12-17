import { Field, InputType } from '@nestjs/graphql';
import { Country } from '../../generated/prisma/client';
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

  @Field(() => Number, { nullable: true })
  @IsOptional()
  durationMonths?: number;
}
