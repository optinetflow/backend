import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { I18Module } from '../common/i18/i18.module';
import { PromotionResolver } from './promotion.resolver';
import { PromotionService } from './promotion.service';

@Module({
  imports: [AuthModule, I18Module],
  providers: [PromotionResolver, PromotionService],
})
export class PromotionModule {}
