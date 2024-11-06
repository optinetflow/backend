import { Field, ID, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsUUID } from 'class-validator';

@InputType()
export class DeletePromotionInput {
  @Field(() => ID)
  @IsUUID()
  @IsNotEmpty()
  promotionId: string;
}
