import { Field, InputType } from '@nestjs/graphql';
import { PackageCategory } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

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
