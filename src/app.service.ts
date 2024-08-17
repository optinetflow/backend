import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  async populateFullname() {
    // Fetch all users from the database
    const users = await this.prisma.user.findMany();

    // Create the raw SQL query to update fullname
    const updateQueries = users
      .map(
        (user) => `
      WHEN id = '${user.id}' THEN CONCAT_WS(' ', '${user.firstname}', '${user.lastname || ''}')
      `,
      )
      .join(' ');

    await this.prisma.$executeRawUnsafe(`
      UPDATE "User"
      SET "fullname" = CASE
        ${updateQueries}
        ELSE "fullname"
      END
    `);
  }
}
