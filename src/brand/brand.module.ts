import { Module } from '@nestjs/common';

import { BrandResolver } from './brand.resolver';
import { BrandService } from './brand.service';

@Module({
  providers: [BrandResolver, BrandService],
  exports: [BrandService],
})
export class BrandModule {}
