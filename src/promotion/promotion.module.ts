import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PromotionResolver } from './promotion.resolver';
import { PromotionService } from './promotion.service';

@Module({
  imports: [AuthModule],
  providers: [PromotionResolver, PromotionService],
})
export class PromotionModule {}
