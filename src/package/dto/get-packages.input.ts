import { Field, InputType } from '@nestjs/graphql';
import { IsEnum, IsOptional } from 'class-validator';

import { PackageCategory } from '../../generated/prisma/client';

@InputType()
export class GetPackageInput {
  @Field(() => PackageCategory, { nullable: true })
  @IsEnum(PackageCategory)
  @IsOptional()
  category?: PackageCategory;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  expirationDays?: number;
}
