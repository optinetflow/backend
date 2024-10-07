export interface SmsServiceInterface {
  sendOtpSms(to: string, message: string): Promise<void>;
}
