import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { BrandModule } from '../brand/brand.module';
import { I18Module } from '../common/i18/i18.module';
import { PaymentModule } from '../payment/payment.module';
import { TelegramModule } from '../telegram/telegram.module';
import { XuiModule } from '../xui/xui.module';
import { ServerResolver } from './server.resolver';
import { ServerService } from './server.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 15_000, // 15 seconds for server operations
      maxRedirects: 5,
    }),
    XuiModule,
    PaymentModule,
    BrandModule,
    TelegramModule,
    I18Module,
  ],
  providers: [ServerResolver, ServerService],
})
export class ServerModule {}
