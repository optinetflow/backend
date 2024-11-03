import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { PaymentModule } from '../payment/payment.module';
import { TelegramModule } from '../telegram/telegram.module';
import { XuiModule } from '../xui/xui.module';
import { PackageResolver } from './package.resolver';
import { PackageService } from './package.service';
import { I18Module } from '../common/i18/i18.module';

@Module({
  imports: [HttpModule, PaymentModule, XuiModule, TelegramModule, I18Module],
  providers: [PackageResolver, PackageService],
  exports: [PackageService],
})
export class PackageModule {}
