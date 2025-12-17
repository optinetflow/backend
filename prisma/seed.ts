import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
await prisma.user.create({
    data: {
      phone: '9333333333',
      fullname: 'Lisa Simpson',
      password: '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', // secret42
      role: 'USER',
    },
  });
  const brand = await prisma.brand.create({
    data: {
      domainName: 'simpson.com',
      title: 'Lisa Simpson',
      botToken: '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', // secret42
      botUsername: 'USER',
      description: "test"
    },
  });
  await prisma.user.deleteMany();

  console.log('Seeding...');

  const user1 = await prisma.user.create({
    data: {
      phone: '9333333333',
      fullname: 'Lisa Simpson',
      password: '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', // secret42
      role: 'USER',
      brandId: brand.id
    },
  });
  const user2 = await prisma.user.create({
    data: {
      phone: '9777777777',
      fullname: 'Bart Simpson',
      role: 'ADMIN',
      brandId: brand.id,
      password: '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', // secret42
    },
  });

  console.log({ user1, user2 });
}

main()
  .catch((error) => console.error(error))
  .finally(async () => {
    await prisma.$disconnect();
  });
