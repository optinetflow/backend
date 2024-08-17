import { Injectable } from '@nestjs/common';
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

    // Loop through each user and update the fullname field
    for (const user of users) {
      // Combine firstname and lastname to create the fullname
      const fullname = `${user.firstname} ${user.lastname ?? ''}`.trim();

      // Update the user's fullname field in the database
      await this.prisma.user.update({
        where: { id: user.id },
        data: { fullname },
      });
    }

    // eslint-disable-next-line no-console
    console.log('fullname is populated');

    return true
  }
}
