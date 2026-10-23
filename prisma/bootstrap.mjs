import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/passwords.js';
import { parseBody, registrationSchema } from '../lib/validation.js';

const categoryNames = [
  'Оборудование',
  'Программное обеспечение',
  'Сеть и интернет',
  'Доступы и учётные записи',
  'Другое',
];

try {
  const data = parseBody(registrationSchema, {
    name: process.env.BOOTSTRAP_ADMIN_NAME || 'Администратор',
    email: process.env.BOOTSTRAP_ADMIN_EMAIL || '',
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD || '',
  });
  const existing = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (existing && existing.role !== 'ADMIN')
    throw new Error(
      'Email уже принадлежит сотруднику. Bootstrap не повышает права существующих аккаунтов; выберите другой адрес.',
    );
  await prisma.$transaction(async (db) => {
    for (const name of categoryNames)
      await db.category.upsert({
        where: { name },
        create: { name },
        update: {},
      });
    if (!existing)
      await db.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash: await hashPassword(data.password),
          role: 'ADMIN',
        },
      });
  });
  console.log(
    existing
      ? 'Категории готовы. Администратор уже существует; пароль не изменён.'
      : 'Категории и администратор созданы. Пароль не выводится и не сохраняется в открытом виде.',
  );
} catch (error) {
  console.error('Ошибка настройки ServiceDesk:', error.code || error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
