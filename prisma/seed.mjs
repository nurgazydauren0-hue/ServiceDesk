import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/passwords.js';
import { parseBody, registrationSchema } from '../lib/validation.js';

const users = [
  { name: 'Анна Смирнова', email: 'admin@servicedesk.demo', role: 'ADMIN' },
  { name: 'Дмитрий Волков', email: 'agent@servicedesk.demo', role: 'AGENT' },
  {
    name: 'Мария Иванова',
    email: 'employee@servicedesk.demo',
    role: 'EMPLOYEE',
  },
];
const categories = [
  'Оборудование',
  'Программное обеспечение',
  'Сеть и интернет',
  'Доступы и учётные записи',
  'Другое',
];
const examples = [
  [
    'Не подключается корпоративный Wi-Fi',
    'Ноутбук видит корпоративную сеть, но подключение завершается ошибкой. Другие сети работают.',
    'Сеть и интернет',
    'HIGH',
    'NEW',
    0,
  ],
  [
    'Не открывается доступ к CRM',
    'При открытии CRM появляется сообщение о недостаточных правах. Нужен доступ для работы с клиентами.',
    'Доступы и учётные записи',
    'URGENT',
    'IN_PROGRESS',
    1,
  ],
  [
    'Принтер не печатает документы',
    'В отделе продаж принтер показывает очередь заданий, но не начинает печать. Перезагрузка не помогла.',
    'Оборудование',
    'MEDIUM',
    'WAITING',
    2,
  ],
  [
    'Установка редактора диаграмм',
    'Для проектной работы необходимо установить лицензированный редактор диаграмм на рабочий компьютер.',
    'Программное обеспечение',
    'LOW',
    'NEW',
    3,
  ],
  [
    'Сбой подключения к VPN',
    'При работе из дома соединение VPN разрывается каждые несколько минут. Проверено на двух сетях.',
    'Сеть и интернет',
    'HIGH',
    'IN_PROGRESS',
    4,
  ],
  [
    'Замена клавиатуры в переговорной',
    'Часть клавиш на клавиатуре в большой переговорной не работает. Просьба проверить устройство.',
    'Оборудование',
    'LOW',
    'RESOLVED',
    5,
  ],
  [
    'Доступ к общей папке проекта',
    'Новый сотрудник не может открыть сетевую папку проекта. Руководитель подтвердил необходимость доступа.',
    'Доступы и учётные записи',
    'MEDIUM',
    'CLOSED',
    7,
  ],
  [
    'Почта не отправляет вложения',
    'Письма с небольшими вложениями остаются в исходящих. Письма без вложений отправляются успешно.',
    'Программное обеспечение',
    'HIGH',
    'RESOLVED',
    8,
  ],
  [
    'Монитор периодически выключается',
    'Второй монитор на рабочем месте теряет изображение. Кабель питания и видеокабель подключены плотно.',
    'Оборудование',
    'MEDIUM',
    'CLOSED',
    10,
  ],
  [
    'Подготовка рабочего места',
    'В понедельник выходит новый сотрудник. Нужно подготовить компьютер и проверить базовые программы.',
    'Другое',
    'MEDIUM',
    'WAITING',
    12,
  ],
];

try {
  const password = process.env.SEED_DEMO_PASSWORD || '';
  parseBody(registrationSchema, {
    name: 'Проверка пароля',
    email: 'seed@servicedesk.demo',
    password,
  });
  const hash = await hashPassword(password);
  const demoUsers = [];
  for (const user of users)
    demoUsers.push(
      await prisma.user.upsert({
        where: { email: user.email },
        create: { ...user, passwordHash: hash },
        update: {},
      }),
    );
  const [admin, agent, employee] = demoUsers;
  if (
    admin.role !== 'ADMIN' ||
    agent.role !== 'AGENT' ||
    employee.role !== 'EMPLOYEE'
  )
    throw new Error(
      'Демонстрационные email уже используются с другими ролями. Данные не перезаписываются.',
    );
  const categoryMap = new Map();
  for (const name of categories) {
    const category = await prisma.category.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    categoryMap.set(name, category.id);
  }
  let created = 0;
  for (const [
    title,
    description,
    category,
    priority,
    status,
    daysAgo,
  ] of examples) {
    if (
      await prisma.ticket.findFirst({
        where: { title, createdById: employee.id },
      })
    )
      continue;
    const createdAt = new Date(Date.now() - daysAgo * 86_400_000);
    const resolvedAt = ['RESOLVED', 'CLOSED'].includes(status)
      ? new Date(createdAt.getTime() + 4 * 3_600_000)
      : null;
    const ticket = await prisma.ticket.create({
      data: {
        title,
        description,
        categoryId: categoryMap.get(category),
        priority,
        status,
        createdById: employee.id,
        assignedToId: status === 'NEW' ? null : agent.id,
        createdAt,
        updatedAt: resolvedAt || createdAt,
        resolvedAt,
      },
    });
    if (status !== 'NEW')
      await prisma.comment.create({
        data: {
          ticketId: ticket.id,
          authorId: agent.id,
          content:
            status === 'WAITING'
              ? 'Проверили обращение. Ожидаем дополнительную информацию от сотрудника.'
              : ['RESOLVED', 'CLOSED'].includes(status)
                ? 'Работы выполнены. Пожалуйста, проверьте результат и сообщите, если проблема повторится.'
                : 'Заявка принята в работу. Проверяем причину проблемы.',
          createdAt: new Date(createdAt.getTime() + 30 * 60_000),
        },
      });
    created += 1;
  }
  console.log(
    `Демо готово: добавлено заявок — ${created}. Аккаунты: ${users.map((user) => user.email).join(', ')}.`,
  );
  console.log(
    'Пароль берётся из SEED_DEMO_PASSWORD. У существующих аккаунтов пароль не изменён.',
  );
} catch (error) {
  console.error('Ошибка seed:', error.code || error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
