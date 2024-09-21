import { Injectable } from '@nestjs/common';
import axios from 'axios';

import { SmsServiceInterface } from '../interfaces/sms.interface';

@Injectable()
export class SmsIrSmsProvider implements SmsServiceInterface {
  private apiKey = '662F4265426C4C724C35747254624C413958376C586D4B51312F757A38335A5A504E414561576F702B43773D';

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
          'x-api-key': '2xqgzpC7Db1Pn7Q4eHJkFFZHRi9PnYfcjVPcyqC98ZzS4wUbhwUsAXhDjfqYKuwF',
        },
      };
      await axios.request(options);
    } catch (error) {
      console.error(error);
    }
  }
}
