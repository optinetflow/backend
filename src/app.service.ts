import { Injectable } from '@nestjs/common';
import { DomainName } from '@prisma/client';
import { PrismaService } from 'nestjs-prisma';

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  getHelloName(name: string): string {
    return `Hello ${name}!`;
  }

  async populateDomainName() {
    await this.prisma.user.updateMany({
      data: {
        domainName: DomainName.VASLKON_COM,
      },
    });
    console.log('DONE populateDomainName');
  }
}
