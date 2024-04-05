import { Field, InputType, Int, registerEnumType } from '@nestjs/graphql';
import { PaymentType } from '@prisma/client';
import { IsUUID } from 'class-validator';

registerEnumType(PaymentType, {
  name: 'PaymentType',
  description: 'Payment Type',
});

@InputType()
export class PurchasePaymentRequestInput {
  @Field()
  id?: string;

  @Field(() => Int)
  amount: number;

  @Field()
  @IsUUID()
  receipt?: string;
}
