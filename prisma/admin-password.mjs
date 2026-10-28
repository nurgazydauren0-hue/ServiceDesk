import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/passwords.js';
import { bootstrapAdminSchema } from '../lib/validation.js';

const adminPasswordSchema = bootstrapAdminSchema.pick({ email: true, password: true });

class AdminPasswordError extends Error {}

try {
  const result = adminPasswordSchema.safeParse({
    email: process.env.BOOTSTRAP_ADMIN_EMAIL || '',
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD || '',
  });
  if (!result.success)
    throw new AdminPasswordError(result.error.issues[0].message);

  const { email, password } = result.data;
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });
  if (!existing)
    throw new AdminPasswordError('Администратор с таким email не найден.');
  if (existing.role !== 'ADMIN')
    throw new AdminPasswordError(
      'Этот email принадлежит пользователю без роли ADMIN. Пароль не изменён.',
    );

  const updated = await prisma.user.updateMany({
    // Recheck the role when writing in case another administrator changed it.
    where: { id: existing.id, email, role: 'ADMIN' },
    data: { passwordHash: await hashPassword(password) },
  });
  if (updated.count !== 1)
    throw new AdminPasswordError(
      'Учётная запись изменилась. Пароль не изменён; повторите команду.',
    );

  console.log('Пароль администратора обновлён. Все данные сохранены.');
} catch (error) {
  console.error(
    'Ошибка смены пароля администратора:',
    error instanceof AdminPasswordError
      ? error.message
      : 'Не удалось обновить пароль. Проверьте подключение к базе данных.',
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
