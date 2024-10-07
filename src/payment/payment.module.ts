import { Module } from '@nestjs/common';

import { TelegramModule } from '../telegram/telegram.module';
import { PaymentResolver } from './payment.resolver';
import { PaymentService } from './payment.service';

@Module({
  imports: [TelegramModule],
  providers: [PaymentResolver, PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
