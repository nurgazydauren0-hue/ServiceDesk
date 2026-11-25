import { apiRoute } from '../../../../lib/http.js';
import { listTicketsForExport } from '../../../../lib/service-desk.js';
import { getRequestLocale } from '../../../../lib/request-language.js';
import { createTranslator } from '../../../../lib/i18n.js';
import { PRIORITY_LABELS, STATUS_LABELS } from '../../../../lib/constants.js';
import { TREND_TIME_ZONE } from '../../../../lib/trend-periods.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUILT_IN_CATEGORIES = new Set([
  'Оборудование',
  'Программное обеспечение',
  'Сеть и интернет',
  'Доступы и учётные записи',
  'Другое',
]);

// Excel in Russian and Kazakh locales expects ";" as the list separator.
function cell(value) {
  let text = value == null ? '' : String(value);
  // Prevent spreadsheet formula injection from user-provided titles and names.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function dateTime(value) {
  if (!value) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TREND_TIME_ZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(value).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export const GET = apiRoute(
  async (_request, _context, user) => {
    const t = createTranslator(await getRequestLocale());
    const tickets = await listTicketsForExport(user);
    const header = [
      'Номер', 'Название', 'Статус', 'Приоритет', 'Категория', 'Автор', 'Email автора',
      'Исполнитель', 'Комментариев', 'Создана', 'Обновлена', 'Решена',
    ].map(t);
    const rows = tickets.map((ticket) => [
      `SD-${String(ticket.id).padStart(4, '0')}`,
      ticket.title,
      t(STATUS_LABELS[ticket.status] || ticket.status),
      t(PRIORITY_LABELS[ticket.priority] || ticket.priority),
      BUILT_IN_CATEGORIES.has(ticket.category?.name) ? t(ticket.category.name) : ticket.category?.name,
      ticket.createdBy?.name,
      ticket.createdBy?.email,
      ticket.assignedTo?.name || t('Не назначен'),
      ticket._count.comments,
      dateTime(ticket.createdAt),
      dateTime(ticket.updatedAt),
      dateTime(ticket.resolvedAt),
    ]);
    const csv = [header, ...rows].map((row) => row.map(cell).join(';')).join('\r\n');
    const today = dateTime(new Date()).slice(0, 10);
    return new Response(`﻿${csv}\r\n`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="servicedesk-tickets-${today}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  },
  { roles: ['ADMIN'] },
);
