import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { I18Module } from '../common/i18/i18.module';
import { SharedServicesModule } from '../common/services/shared-services.module';
import { PaymentModule } from '../payment/payment.module';
import { TelegramModule } from '../telegram/telegram.module';
import { XuiModule } from '../xui/xui.module';
import { PackageResolver } from './package.resolver';
import { PackageService } from './package.service';

@Module({
  imports: [
    AuthModule,
    HttpModule.register({
      timeout: 15_000, // 15 seconds for package operations
      maxRedirects: 5,
    }),
    forwardRef(() => PaymentModule),
    forwardRef(() => XuiModule),
    forwardRef(() => TelegramModule),
    I18Module,
    SharedServicesModule,
  ],
  providers: [PackageResolver, PackageService],
  exports: [PackageService],
})
export class PackageModule {}
