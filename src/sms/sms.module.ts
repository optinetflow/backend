import { Module } from '@nestjs/common';

import { SmsIrSmsProvider } from './providers/kavenegar.provider';
import { SmsService } from './sms.service';

@Module({
  providers: [SmsService, SmsIrSmsProvider],
  exports: [SmsService],
})
export class SmsModule {}
