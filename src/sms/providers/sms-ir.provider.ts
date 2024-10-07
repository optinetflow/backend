import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { SecurityConfig } from '../../common/configs/config.interface';
import { SmsServiceInterface } from '../interfaces/sms.interface';

@Injectable()
export class SmsIrSmsProvider implements SmsServiceInterface {
  constructor(private readonly configService: ConfigService) {}

  private apiKey = this.configService.get<SecurityConfig>('security')?.smsIrApiKey;

  async sendOtpSms(to: string, otp: string): Promise<void> {
    try {
      const options = {
        method: 'POST',
        url: 'https://api.sms.ir/v1/send/verify',
        data: {
          mobile: to,
          templateId: 682_184,
          parameters: [
            {
              name: 'Code',
              value: otp,
            },
          ],
        },
        headers: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          'x-api-key': this.apiKey,
        },
      };
      await axios.request(options);
    } catch (error) {
      console.error(error);
    }
  }
}
