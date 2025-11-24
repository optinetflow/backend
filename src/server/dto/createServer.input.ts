import { Field, InputType, Int, registerEnumType } from '@nestjs/graphql';
import { Country } from '@prisma/client';
import { IsUUID } from 'class-validator';

registerEnumType(Country, {
  name: 'Country',
  description: 'Country',
});

@InputType()
export class CreateServerInput {
  @Field()
  @IsUUID()
  ip: string;

  @Field()
  // @Matches(/^[\dA-Za-z][\dA-Za-z-]{1,61}[\dA-Za-z]\.[A-Za-z]{1,10}$/)
  domain: string;

  @Field(() => Country)
  country: Country;

  @Field(() => Int)
  inboundId: number;
}
