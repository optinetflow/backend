import { Injectable } from '@nestjs/common';

import { SmsIrSmsProvider } from './providers/kavenegar.provider';

@Injectable()
export class SmsService {
  constructor(private readonly smsProviderService: SmsIrSmsProvider) {}

  async sendOtp(phone: string, otp: string) {
    return this.smsProviderService.sendOtpSms(phone, otp);
  }
}
