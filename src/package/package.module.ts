import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { PaymentModule } from '../payment/payment.module';
import { XuiModule } from '../xui/xui.module';
import { PackageResolver } from './package.resolver';
import { PackageService } from './package.service';

@Module({
  imports: [HttpModule, PaymentModule, XuiModule],
  providers: [PackageResolver, PackageService],
  exports: [PackageService],
})
export class PackageModule {}
