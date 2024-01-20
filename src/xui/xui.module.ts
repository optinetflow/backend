import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { PaymentModule } from '../payment/payment.module';
import { XuiResolver } from './xui.resolver';
import { XuiService } from './xui.service';

@Module({
  imports: [HttpModule, PaymentModule],
  providers: [XuiResolver, XuiService],
  exports: [XuiService],
})
export class XuiModule {}
