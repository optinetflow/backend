import { PrismaClient } from '@prisma/client';
import { title } from 'process';

const prisma = new PrismaClient();

async function main() {
  const brand = await prisma.brand.create({
    data: {
      domainName: 'lisa@simpson.com',
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
      phone: 'lisa@simpson.com',
      fullname: 'Lisa Simpson',
      password: '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', // secret42
      role: 'USER',
      brandId: brand.id
    },
  });
  const user2 = await prisma.user.create({
    data: {
      phone: 'bart@simpson.com',
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
