import { Module } from '@nestjs/common';

import { PackageModule } from '../package/package.module';
import { PaymentModule } from '../payment/payment.module';
import { XuiModule } from '../xui/xui.module';
import { HomeScene } from './scenes/home.scene';
import { RegisterScene } from './scenes/register.scene';
import { TelegramService } from './telegram.service';
import { TelegramUpdate } from './telegram.update';

@Module({
  imports: [XuiModule, PaymentModule, PackageModule],
  providers: [TelegramService, TelegramUpdate, RegisterScene, HomeScene],
})
export class TelegramModule {}
