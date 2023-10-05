import { Field, InputType, registerEnumType } from '@nestjs/graphql';
import { DomainState, PackageType } from '@prisma/client';
import { IsNotEmpty, Matches, MinLength } from 'class-validator';

registerEnumType(PackageType, {
  name: 'PackageType',
  description: 'PackageType',
});

@InputType()
export class BuyPackageInput {
  @Field(() => PackageType)
  type: PackageType;
}
