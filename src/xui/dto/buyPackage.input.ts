import { Field, InputType, registerEnumType } from '@nestjs/graphql';
import { DomainState } from '@prisma/client';
import { IsNotEmpty, Matches, MinLength } from 'class-validator';

@InputType()
export class BuyPackageInput {
  @Field()
  packageId: string;
}
