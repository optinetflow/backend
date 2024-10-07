import { Args, Query, Resolver } from '@nestjs/graphql';

import { BrandService } from './brand.service';
import { GetBrandInfoInput } from './dto/get-brand-info-input.dto';
import { Brand } from './models/brand.model';

@Resolver(() => Brand)
export class BrandResolver {
  constructor(private readonly brandService: BrandService) {}

  @Query(() => Brand)
  getBrandInfo(@Args('input') { domainName }: GetBrandInfoInput) {
    return this.brandService.getBrandByDomainName(domainName);
  }
}
