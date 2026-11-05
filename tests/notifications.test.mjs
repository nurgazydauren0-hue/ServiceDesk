import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNotificationEvents, NOTIFICATION_LIMIT } from '../lib/notification-events.js';
import { getNotifications } from '../lib/notifications.js';

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
