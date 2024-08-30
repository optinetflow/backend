import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  getHelloName(name: string): string {
    return `Hello ${name}!`;
  }

  async populateTelegramUserChatId() {
    await this.prisma.$executeRaw`
    UPDATE "TelegramUser"
    SET "chatId" = "id"`;
    console.log('Update successful.');
  }
}
