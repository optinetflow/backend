import { Field, InputType, Int, registerEnumType } from '@nestjs/graphql';
import { PaymentType } from '@prisma/client';
import { IsOptional, IsUUID } from 'class-validator';

@InputType()
export class BuyRechargePackageInput {
  @Field()
  @IsUUID()
  rechargePackageId: string;

  @Field()
  @IsUUID()
  receipt: string;
}
