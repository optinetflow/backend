import { Module } from '@nestjs/common';

import { TelegramModule } from '../telegram/telegram.module';
import { UsersModule } from '../users/users.module';
import { PaymentResolver } from './payment.resolver';
import { PaymentService } from './payment.service';
import { I18Module } from '../common/i18/i18.module';

@Module({
  imports: [TelegramModule, UsersModule, I18Module],
  providers: [PaymentResolver, PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
