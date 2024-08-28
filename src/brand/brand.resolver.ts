import { Resolver } from '@nestjs/graphql';

import { BrandService } from './brand.service';
import { Brand } from './models/brand.model';

@Resolver(() => Brand)
export class BrandResolver {
  constructor(private readonly brandService: BrandService) {}
}
