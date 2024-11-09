import { Field, ID, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsUUID, Matches } from 'class-validator';

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
}
