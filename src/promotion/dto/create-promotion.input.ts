import { Field, Float, ID, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

@InputType()
export class CreatePromotionInput {
  @Field()
  @IsNotEmpty()
  @Matches(/^[\dA-Za-z]{4,10}$/, {
    message: 'Code must be alphanumeric, at least 4 characters long, and contain only English letters and numbers.',
  })
  code: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  giftPackageId?: string;

  @Field(() => Float, { nullable: true })
  @Max(100)
  @Min(0)
  @IsOptional()
  initialDiscountPercent?: number;
}
