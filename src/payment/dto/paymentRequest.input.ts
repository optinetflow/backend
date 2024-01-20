import { Field, InputType, Int, registerEnumType } from '@nestjs/graphql';
import { PaymentType } from '@prisma/client';
import { IsUUID } from 'class-validator';

registerEnumType(PaymentType, {
  name: 'PaymentType',
  description: 'Payment Type',
});

@InputType()
export class PaymentRequestInput {
  @Field()
  id?: string;

  @Field(() => Int)
  amount: number;

  @Field(() => Int, { nullable: true })
  profitAmount?: number;

  @Field(() => PaymentType)
  type: PaymentType;

  @Field()
  @IsUUID()
  receipt?: string;
}
