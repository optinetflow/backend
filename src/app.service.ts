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
    const telegramUsers = await this.prisma.telegramUser.findMany();
    const promises = telegramUsers.map(async (telegramUser) =>
      this.prisma.telegramUser.update({
        where: {
          id: telegramUser.id,
        },
        data: {
          chatId: telegramUser.id,
        },
      }),
    );

    return Promise.all(promises);
  }
}
