import test from 'node:test';
import assert from 'node:assert/strict';
import { demoTicketMarkerFromDescription, generateDemoTicketSpecs } from '../prisma/demo-ticket-data.mjs';

const now = new Date('2026-11-12T10:30:00.000Z');
const day = 86_400_000;

test('демо-набор заполняет сутки, две недели, месяц и год разными данными', () => {
  const tickets = generateDemoTicketSpecs(now);
  assert.equal(tickets.length, 120);
  const count = (days) => tickets.filter((ticket) => now - ticket.createdAt < days * day).length;
  assert.equal(count(1), 16);
  assert.equal(count(14), 44);
  assert.equal(count(30), 66);
  assert.equal(count(365), 120);
  assert.deepEqual(new Set(tickets.map((ticket) => ticket.status)), new Set(['NEW', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED']));
  assert.equal(new Set(tickets.map((ticket) => ticket.priority)).size, 4);
  assert.equal(new Set(tickets.map((ticket) => ticket.categoryName)).size, 5);
});

test('демо-времена и комментарии согласованы и не попадают в будущее', () => {
  for (const ticket of generateDemoTicketSpecs(now)) {
    assert.ok(ticket.createdAt < now);
    assert.ok(ticket.updatedAt >= ticket.createdAt && ticket.updatedAt <= now);
    assert.equal(Boolean(ticket.resolvedAt), ['RESOLVED', 'CLOSED'].includes(ticket.status));
    if (ticket.resolvedAt) assert.ok(ticket.resolvedAt > ticket.createdAt && ticket.resolvedAt <= now);
    let previous = ticket.createdAt;
    for (const comment of ticket.comments) {
      assert.ok(comment.createdAt >= previous && comment.createdAt <= now);
      previous = comment.createdAt;
    }
    assert.ok(ticket.title.startsWith('[Демо]') && ticket.title.length <= 160);
  }
});

test('стабильные отдельные маркеры позволяют повторять запуск без дубликатов', () => {
  const first = generateDemoTicketSpecs(now);
  const later = generateDemoTicketSpecs(new Date(now.getTime() + day));
  assert.equal(new Set(first.map((ticket) => ticket.marker)).size, 120);
  assert.deepEqual(first.map((ticket) => ticket.marker), later.map((ticket) => ticket.marker));
  for (const ticket of first) assert.equal(demoTicketMarkerFromDescription(ticket.description), ticket.marker);
  assert.equal(demoTicketMarkerFromDescription('Обычная заявка без маркера'), null);
  assert.throws(() => generateDemoTicketSpecs(new Date('invalid')), TypeError);
});
