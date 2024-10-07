import { Module } from '@nestjs/common';

import { SmsIrSmsProvider } from './providers/sms-ir.provider';
import { SmsService } from './sms.service';

@Module({
  providers: [SmsService, SmsIrSmsProvider],
  exports: [SmsService],
})
export class SmsModule {}
