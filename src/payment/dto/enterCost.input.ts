import { Field, InputType, Int, registerEnumType } from '@nestjs/graphql';
import { PaymentType } from '@prisma/client';

registerEnumType(PaymentType, {
  name: 'PaymentType',
  description: 'Payment Type',
});

@InputType()
export class EnterCostInput {
  @Field(() => Int)
  amount: number;

  @Field(() => PaymentType)
  type: PaymentType;

  @Field(() => String, { nullable: true })
  description?: string;
}
