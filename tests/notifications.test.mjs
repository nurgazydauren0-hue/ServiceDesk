import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNotificationEvents, NOTIFICATION_LIMIT } from '../lib/notification-events.js';
import {
  getNotifications,
  getNotificationPage,
  parseNotificationArchiveParams,
  NOTIFICATION_PAGE_SIZE,
  NOTIFICATION_MAX_PAGE,
} from '../lib/notifications.js';

const now = new Date('2026-11-05T12:00:00.000Z');
const since = new Date('2026-10-06T12:00:00.000Z');
const employee = { id: 'employee', role: 'EMPLOYEE' };
const agent = { id: 'agent', role: 'AGENT' };
const admin = { id: 'admin', role: 'ADMIN' };
const ticket = (id, extra = {}) => ({
  id,
  title: `Ticket ${id}`,
  status: 'NEW',
  createdById: employee.id,
  assignedToId: null,
  createdAt: new Date('2026-11-01T10:00:00.000Z'),
  updatedAt: new Date('2026-11-01T10:00:00.000Z'),
  ...extra,
});
const feed = (user, data, options = {}) =>
  buildNotificationEvents(user, data, { since, now, ...options });

test('уведомления используют те же права на заявки для всех трёх ролей', () => {
  const tickets = [
    ticket(1),
    ticket(2, { assignedToId: agent.id }),
    ticket(3, { createdById: agent.id }),
    ticket(4, { createdById: 'stranger', assignedToId: 'another-agent' }),
  ];
  assert.deepEqual(feed(admin, { createdTickets: tickets }).map((event) => event.ticketId), [4, 3, 2, 1]);
  assert.deepEqual(feed(agent, { createdTickets: tickets }).map((event) => event.ticketId), [3, 2]);
  assert.deepEqual(feed(employee, { createdTickets: tickets }).map((event) => event.ticketId), [2, 1]);

  const hidden = ticket(5, {
    createdById: 'stranger',
    updatedAt: new Date('2026-11-04T10:00:00Z'),
  });
  assert.deepEqual(feed(agent, {
    updatedTickets: [hidden],
    comments: [{ id: 'hidden-comment', authorId: 'stranger', author: { name: 'Hidden' }, createdAt: now, ticket: hidden }],
  }), []);
});

test('лента сообщает только подтверждённые события и исключает собственные комментарии', () => {
  const current = ticket(1, {
    assignedToId: agent.id,
    status: 'IN_PROGRESS',
    updatedAt: new Date('2026-11-04T09:00:00Z'),
  });
  const ownComment = {
    id: 'own', authorId: agent.id, author: { name: 'Agent' },
    createdAt: new Date('2026-11-04T11:00:00Z'), ticket: current,
  };
  const otherComment = {
    id: 'other', authorId: employee.id, author: { name: 'Employee' },
    createdAt: new Date('2026-11-04T10:00:00Z'), ticket: current,
  };
  const notifications = feed(agent, {
    createdTickets: [current], updatedTickets: [current, ticket(2, { assignedToId: agent.id })],
    comments: [ownComment, otherComment],
  });
  assert.deepEqual(notifications.map((event) => event.type), ['comment_added', 'ticket_updated', 'ticket_created']);
  assert.deepEqual(notifications.map((event) => event.createdAt), [
    '2026-11-04T10:00:00.000Z', '2026-11-04T09:00:00.000Z', '2026-11-01T10:00:00.000Z',
  ]);
  assert.equal(notifications[0].authorName, 'Employee');
  assert.equal(notifications[1].authorName, undefined);
  assert.ok(notifications.every((event) => event.ticketId === current.id && event.status === 'IN_PROGRESS'));
  assert.ok(notifications.every((event) => !event.type.includes('assigned') && !event.type.includes('status')));
});

test('старые заявки дают свежие изменения и комментарии, но не ложное новое создание', () => {
  const old = ticket(1, {
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2026-11-03T09:00:00Z'),
  });
  const notifications = feed(admin, {
    createdTickets: [old], updatedTickets: [old],
    comments: [{ id: 'recent', authorId: employee.id, author: { name: 'Employee' }, createdAt: now, ticket: old }],
  });
  assert.deepEqual(notifications.map((event) => event.type), ['comment_added', 'ticket_updated']);
  assert.deepEqual(feed(admin, { createdTickets: [
    ticket(2, { createdAt: new Date('2026-12-01T00:00:00Z') }),
    ticket(3, { createdAt: new Date(NaN) }),
  ] }), []);
});

test('порядок, идентификаторы и ограничение ленты стабильны при одинаковом времени', () => {
  const tickets = Array.from({ length: 60 }, (_, index) => ticket(index + 1));
  const events = feed(admin, { createdTickets: [tickets[0], ...tickets] });
  assert.equal(events.length, NOTIFICATION_LIMIT);
  assert.equal(new Set(events.map((event) => event.id)).size, NOTIFICATION_LIMIT);
  assert.deepEqual(events.map((event) => event.ticketId), Array.from({ length: 40 }, (_, index) => 60 - index));
  assert.deepEqual(feed(admin, { createdTickets: [...tickets].reverse() }), events);
  assert.equal(feed(admin, { createdTickets: tickets }, { limit: 3 }).length, 3);
  assert.equal(feed(admin, { createdTickets: tickets }, { limit: 100 }).length, 40);
});

test('загрузка ленты делает три ограниченных запроса с серверной областью доступа', async () => {
  for (const user of [admin, agent, employee]) {
    const calls = [];
    const db = {
      ticket: { async findMany(query) { calls.push(['ticket', query]); return []; } },
      comment: { async findMany(query) { calls.push(['comment', query]); return []; } },
    };
    assert.deepEqual(await getNotifications(user, { db, now }), {
      notifications: [], generatedAt: now.toISOString(), since: since.toISOString(),
    });
    assert.equal(calls.length, 3);
    const scope = user.role === 'ADMIN' ? {} : user.role === 'AGENT'
      ? { OR: [{ assignedToId: user.id }, { createdById: user.id }] }
      : { createdById: user.id };
    for (const [, query] of calls) {
      assert.equal(query.take, 40);
      assert.equal('include' in query, false);
      assert.ok(query.select);
    }
    assert.deepEqual(calls[0][1].where, { AND: [scope, { createdAt: { gte: since, lte: now } }] });
    assert.deepEqual(calls[1][1].where, { AND: [scope, { updatedAt: { gte: since, lte: now } }] });
    assert.deepEqual(calls[2][1].where, { AND: [
      { ticket: { is: scope } }, { authorId: { not: user.id } }, { createdAt: { gte: since, lte: now } },
    ] });
    assert.deepEqual(calls[2][1].select.author, { select: { name: true } });
    assert.equal(calls[2][1].select.content, undefined);
    assert.equal(calls[0][1].select.description, undefined);
  }
});

function archiveDb(tickets, comments = [], calls = []) {
  const field = Symbol('Ticket.createdAt');
  const ordered = (rows, orderBy, take) => rows.toSorted((a, b) => {
    for (const order of orderBy) {
      const key = Object.keys(order)[0];
      const direction = order[key] === 'desc' ? -1 : 1;
      const left = a[key] instanceof Date ? a[key].getTime() : a[key];
      const right = b[key] instanceof Date ? b[key].getTime() : b[key];
      if (left !== right) return (left > right ? 1 : -1) * direction;
    }
    return 0;
  }).slice(0, take);
  return {
    ticket: {
      fields: { createdAt: field },
      async findMany(query) {
        calls.push(['ticket', query]);
        const condition = query.where.AND.at(-1);
        const key = condition.updatedAt ? 'updatedAt' : 'createdAt';
        const range = condition[key];
        if (key === 'updatedAt') assert.equal(range.gt, field);
        const rows = tickets.filter((row) => row[key] <= range.lte &&
          (key !== 'updatedAt' || row.updatedAt > row.createdAt));
        return ordered(rows, query.orderBy, query.take);
      },
    },
    comment: {
      async findMany(query) {
        calls.push(['comment', query]);
        const range = query.where.AND.at(-1).createdAt;
        const excludedAuthor = query.where.AND[1].authorId.not;
        return ordered(comments.filter((row) => row.createdAt <= range.lte &&
          row.authorId !== excludedAuthor), query.orderBy, query.take);
      },
    },
  };
}

test('архив содержит старые события сверх лимита колокольчика и делится на страницы без потерь', async () => {
  const date = new Date('2025-01-01T10:00:00Z');
  const tickets = Array.from({ length: 51 }, (_, index) => ticket(index + 1, {
    createdAt: date, updatedAt: date,
  }));
  const db = archiveDb(tickets);
  const pages = await Promise.all([1, 2, 3].map((page) => getNotificationPage(admin, { page, db, now })));
  assert.deepEqual(pages.map((page) => page.notifications.length), [20, 20, 11]);
  assert.deepEqual(pages.map((page) => page.hasMore), [true, true, false]);
  assert.ok(pages.every((page) => page.pageSize === NOTIFICATION_PAGE_SIZE && page.since === null));
  const events = pages.flatMap((page) => page.notifications);
  assert.deepEqual(events.map((event) => event.ticketId), Array.from({ length: 51 }, (_, index) => 51 - index));
  assert.equal(new Set(events.map((event) => event.id)).size, 51);
  assert.deepEqual(feed(admin, { createdTickets: tickets }), []);
});

test('архив смешивает комментарии и обновления с одинаковыми датами в стабильном порядке', async () => {
  const date = new Date('2026-11-01T10:00:00Z');
  const tickets = Array.from({ length: 12 }, (_, index) => ticket(index + 1, {
    updatedAt: new Date('2026-11-02T10:00:00Z'),
  }));
  const comments = Array.from({ length: 35 }, (_, index) => ({
    id: `comment-${String(index + 1).padStart(3, '0')}`,
    ticketId: (index % tickets.length) + 1,
    ticket: tickets[index % tickets.length],
    authorId: employee.id,
    author: { name: 'Employee' },
    createdAt: date,
  }));
  const db = archiveDb([...tickets].reverse(), [...comments].reverse());
  const result = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const response = await getNotificationPage(admin, { db, now, page });
    result.push(...response.notifications);
    hasMore = response.hasMore;
    page += 1;
  }
  assert.equal(result.length, 59);
  assert.equal(new Set(result.map((event) => event.id)).size, 59);
  assert.deepEqual(result.slice(0, 12).map((event) => event.type), Array(12).fill('ticket_updated'));
  for (let i = 1; i < result.length; i += 1) {
    const previous = result[i - 1];
    const current = result[i];
    assert.ok(previous.createdAt > current.createdAt ||
      (previous.createdAt === current.createdAt && previous.ticketId > current.ticketId) ||
      (previous.createdAt === current.createdAt && previous.ticketId === current.ticketId && previous.id > current.id));
  }
});

test('архив использует границу первой страницы и не сдвигает страницы из-за новых событий', async () => {
  const tickets = Array.from({ length: 25 }, (_, index) => ticket(index + 1));
  const db = archiveDb(tickets);
  const first = await getNotificationPage(admin, { db, now });
  tickets.push(ticket(99, { createdAt: new Date('2026-11-06T10:00:00Z') }));
  const params = parseNotificationArchiveParams(new URLSearchParams({ scope: 'all', page: '2', asOf: first.generatedAt }), {
    now: new Date('2026-11-07T00:00:00Z'),
  });
  const second = await getNotificationPage(admin, { ...params, db });
  assert.equal(second.generatedAt, first.generatedAt);
  assert.deepEqual(second.notifications.map((event) => event.ticketId), [5, 4, 3, 2, 1]);
  assert.equal(second.hasMore, false);
});

test('все запросы архива ограничены ролью, а неизменённые заявки не занимают места обновлений', async () => {
  for (const user of [admin, agent, employee]) {
    const calls = [];
    const unchanged = Array.from({ length: 80 }, (_, index) => ticket(index + 1));
    const changed = ticket(100, { createdAt: new Date('2025-01-01T00:00:00Z'), updatedAt: new Date('2025-01-02T00:00:00Z') });
    const db = archiveDb([...unchanged, changed], [], calls);
    await getNotificationPage(user, { page: 2, db, now });
    assert.equal(calls.length, 3);
    const scope = user.role === 'ADMIN' ? {} : user.role === 'AGENT'
      ? { OR: [{ assignedToId: user.id }, { createdById: user.id }] }
      : { createdById: user.id };
    assert.deepEqual(calls[0][1].where.AND[0], scope);
    assert.deepEqual(calls[1][1].where.AND[0], scope);
    assert.deepEqual(calls[2][1].where.AND[0], { ticket: { is: scope } });
    assert.deepEqual(calls[2][1].where.AND[1], { authorId: { not: user.id } });
    for (const [, query] of calls) {
      assert.equal(query.take, 41);
      assert.equal('include' in query, false);
      assert.equal(query.select.description, undefined);
      assert.equal(query.select.passwordHash, undefined);
      assert.equal(query.select.content, undefined);
    }
  }
});

test('архив отклоняет недопустимые страницы и даты до обращения к базе', async () => {
  assert.equal(parseNotificationArchiveParams(new URLSearchParams()), null);
  assert.deepEqual(parseNotificationArchiveParams(new URLSearchParams('scope=all')), { page: 1 });
  for (const query of [
    'scope=unknown', 'page=1', 'scope=all&page=0', 'scope=all&page=-1',
    'scope=all&page=01', 'scope=all&page=1.5', 'scope=all&page=1001',
    'scope=all&page=1&page=2', 'scope=all&scope=all', 'scope=all&asOf=',
    'scope=all&asOf=not-a-date', 'scope=all&asOf=2026-12-01T00:00:00.000Z',
    'scope=all&asOf=2026-02-30T00:00:00.000Z',
  ]) {
    assert.throws(() => parseNotificationArchiveParams(new URLSearchParams(query), { now }),
      (error) => error.status === 400, query);
  }
  for (const page of [0, -1, 1.2, NOTIFICATION_MAX_PAGE + 1, NaN])
    await assert.rejects(getNotificationPage(admin, { page, db: {}, now }), (error) => error.status === 400);
});
