import 'reflect-metadata';

import { Field, HideField, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Country, InboundType, PackageCategory } from '../../generated/prisma/client';

import { Brand } from '../../brand/models/brand.model';
import { BaseModel } from '../../common/models/base.model';

@ObjectType()
export class AvailableCountries extends BaseModel {
  @Field(() => PackageCategory)
  category: PackageCategory;

  @Field(() => [Country])
  countries: Country[];
}
