export const DEMO_TICKET_BATCH = 'servicedesk-demo:trends-v1';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const examples = [
  ['Не подключается корпоративный Wi-Fi', 'Сеть и интернет', 'Ноутбук видит корпоративную сеть, но подключение завершается ошибкой. Необходимо проверить сетевой профиль.'],
  ['Не открывается CRM', 'Доступы и учётные записи', 'При открытии CRM появляется сообщение о недостаточных правах. Нужен доступ к тестовому рабочему пространству.'],
  ['Принтер не печатает документы', 'Оборудование', 'Задания остаются в очереди печати. Перезапуск принтера не помог, требуется диагностика подключения.'],
  ['Установка редактора диаграмм', 'Программное обеспечение', 'Для проектной работы необходимо установить согласованный редактор диаграмм на рабочий компьютер.'],
  ['Сбой подключения к VPN', 'Сеть и интернет', 'Соединение VPN прерывается при работе из дома. Просьба проверить настройки клиента и сертификат.'],
  ['Замена клавиатуры в переговорной', 'Оборудование', 'Несколько клавиш в переговорной не отвечают на нажатия. Нужна проверка и при необходимости замена устройства.'],
  ['Доступ к общей папке проекта', 'Доступы и учётные записи', 'Новый участник проекта не видит общую сетевую папку. Требуется проверить членство в группе доступа.'],
  ['Почта не отправляет вложения', 'Программное обеспечение', 'Письма с вложениями остаются в исходящих. Обычные текстовые письма отправляются без ошибок.'],
  ['Монитор теряет изображение', 'Оборудование', 'Второй монитор периодически гаснет. Кабели подключены, необходима проверка порта и настроек экрана.'],
  ['Подготовка рабочего места', 'Другое', 'Нужно подготовить рабочее место: проверить компьютер, гарнитуру и набор основных программ.'],
  ['Не работает гарнитура для звонков', 'Оборудование', 'Приложение видеосвязи не обнаруживает микрофон гарнитуры. Просьба проверить устройство и разрешения.'],
  ['Обновление офисного приложения', 'Программное обеспечение', 'Приложение запрашивает обновление, но установка завершается ошибкой. Требуется помощь с обновлением.'],
  ['Медленно открывается внутренняя база знаний', 'Сеть и интернет', 'Внутренний портал загружается медленно в нескольких браузерах. Просьба проверить доступность сервиса.'],
  ['Сброс второго фактора входа', 'Доступы и учётные записи', 'После замены тестового телефона требуется повторная настройка второго фактора входа.'],
  ['Настройка оборудования для презентации', 'Другое', 'Перед встречей необходимо проверить подключение проектора, звук и демонстрацию экрана.'],
];
const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const activeStatuses = ['NEW', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'];

export function demoTicketMarker(index) {
  return `[${DEMO_TICKET_BATCH}:${String(index + 1).padStart(3, '0')}]`;
}

export function demoTicketMarkerFromDescription(description) {
  return description.match(/\[servicedesk-demo:trends-v1:\d{3}\]/)?.[0] || null;
}

export function generateDemoTicketSpecs(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw new TypeError('A valid reference date is required.');

  // 16 in the last 24 hours, 28 more in the previous 13 days,
  // 22 more in the previous month, and 54 across the rest of the year.
  const ages = [
    ...Array.from({ length: 16 }, (_, i) => (0.5 + i * 1.45) * HOUR),
    ...Array.from({ length: 28 }, (_, i) => (1.1 + i * 0.45) * DAY),
    ...Array.from({ length: 22 }, (_, i) => (14.1 + i * 0.7) * DAY),
    ...Array.from({ length: 54 }, (_, i) => (31.5 + i * 6.15) * DAY),
  ];

  return ages.map((age, index) => {
    const [subject, categoryName, details] = examples[index % examples.length];
    const marker = demoTicketMarker(index);
    const createdAt = new Date(now.getTime() - age);
    const status = index < 66 ? activeStatuses[index % activeStatuses.length]
      : index % 2 ? 'CLOSED' : 'RESOLVED';
    const completed = ['RESOLVED', 'CLOSED'].includes(status);
    const workDuration = Math.min(age * 0.6, (2 + (index % 36)) * HOUR);
    const resolvedAt = completed ? new Date(createdAt.getTime() + workDuration) : null;
    const comments = status === 'NEW' ? [] : [{
      content: status === 'WAITING'
        ? '[Демо] Проверили обращение. Ожидаем уточнение симптомов и удобное время для подключения.'
        : '[Демо] Заявка принята в работу. Проверяем причину и согласовываем решение.',
      createdAt: new Date(createdAt.getTime() + Math.min(15 * 60_000, age * 0.15)),
    }];
    if (completed) comments.push({
      content: '[Демо] Работы выполнены: настройки проверены, доступность восстановлена. Результат подтверждён в тестовом сценарии.',
      createdAt: resolvedAt,
    });
    return {
      marker,
      categoryName,
      title: `[Демо] ${subject} · ${String(index + 1).padStart(3, '0')}`,
      description: `Демонстрационная заявка для проверки интерфейса и графиков. Реальные работы не требуются.\n${marker}\n\n${details}`,
      status,
      priority: priorities[index % priorities.length],
      createdAt,
      updatedAt: resolvedAt || comments.at(-1)?.createdAt || createdAt,
      resolvedAt,
      comments,
    };
  });
}
