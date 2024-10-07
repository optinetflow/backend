import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { BrandModule } from '../brand/brand.module';
import { PaymentModule } from '../payment/payment.module';
import { TelegramModule } from '../telegram/telegram.module';
import { XuiModule } from '../xui/xui.module';
import { XuiService } from '../xui/xui.service';
import { ServerResolver } from './server.resolver';
import { ServerService } from './server.service';

@Module({
  imports: [HttpModule, XuiModule, PaymentModule, BrandModule, TelegramModule],
  providers: [ServerResolver, ServerService, XuiService],
})
export class ServerModule {}
