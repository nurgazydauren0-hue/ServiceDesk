import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTicketQuery } from '../lib/ticket-query.js';

const employee = { id: 'employee-1', role: 'EMPLOYEE' };
const agent = { id: 'agent-1', role: 'AGENT' };
const admin = { id: 'admin-1', role: 'ADMIN' };
const query = (user, values = {}) => buildTicketQuery(user, new URLSearchParams(values));

test('сортировки столбцов работают на сервере до пагинации и имеют стабильный ID', () => {
  const fields = {
    title: 'title', category: 'category', priority: 'priority',
    status: 'status', assignee: 'assignedTo', author: 'createdBy',
  };
  for (const [column, field] of Object.entries(fields)) {
    for (const direction of ['asc', 'desc']) {
      const { findMany, count, page, pageSize } = query(admin, {
        sort: `${column}_${direction}`, page: '3', pageSize: '7',
      });
      const expected = ['category', 'assignee', 'author'].includes(column)
        ? { [field]: { name: direction } }
        : { [field]: direction };
      assert.deepEqual(findMany.orderBy[0], expected);
      assert.deepEqual(findMany.orderBy.at(-1), { id: direction });
      assert.equal(findMany.skip, 14);
      assert.equal(findMany.take, 7);
      assert.equal(page, 3);
      assert.equal(pageSize, 7);
      assert.equal(count.where, findMany.where);
      assert.equal('skip' in count, false);
      assert.equal('take' in count, false);
    }
  }
});

test('прежние сортировки сохраняют смысл и получают ID для одинаковых приоритетов', () => {
  for (const [sort, orderBy] of [
    ['newest', [{ createdAt: 'desc' }, { id: 'desc' }]],
    ['oldest', [{ createdAt: 'asc' }, { id: 'asc' }]],
    ['updated', [{ updatedAt: 'desc' }, { id: 'desc' }]],
    ['priority', [{ priority: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]],
  ]) assert.deepEqual(query(admin, { sort }).findMany.orderBy, orderBy);
  assert.deepEqual(query(admin, { sort: 'priority_desc' }), query(admin, { sort: 'priority' }));
});

test('права, свои заявки и фильтры столбцов одинаковы для строк и общего количества', () => {
  for (const user of [admin, agent, employee]) {
    const { findMany, count } = query(user, {
      mine: '1', categoryId: 'category-1', priority: 'HIGH', assigneeRole: 'AGENT',
      status: 'CLOSED', statusGroup: 'resolved', q: ' #42 ',
    });
    const scope = user.role === 'ADMIN' ? {} : user.role === 'AGENT'
      ? { OR: [{ assignedToId: user.id }, { createdById: user.id }] }
      : { createdById: user.id };
    assert.deepEqual(findMany.where.AND, [
      scope,
      { createdById: user.id },
      { OR: [
        { title: { contains: '#42', mode: 'insensitive' } },
        { description: { contains: '#42', mode: 'insensitive' } },
        { id: 42 },
      ] },
      { status: 'CLOSED' },
      { status: { in: ['RESOLVED', 'CLOSED'] } },
      { priority: 'HIGH' },
      { categoryId: 'category-1' },
      { assignedTo: { is: { role: 'AGENT' } } },
    ]);
    assert.equal(findMany.where, count.where);
  }
});

test('группа решённых не ослабляет точный статус и не подменяет область доступа', () => {
  const resolved = query(employee, { statusGroup: 'resolved' }).findMany.where;
  assert.deepEqual(resolved, { AND: [
    { createdById: employee.id }, { status: { in: ['RESOLVED', 'CLOSED'] } },
  ] });
  const contradictory = query(agent, { status: 'NEW', statusGroup: 'resolved' }).findMany.where;
  assert.ok(contradictory.AND.some((condition) => condition.status === 'NEW'));
  assert.ok(contradictory.AND.some((condition) => condition.status?.in?.includes('RESOLVED')));
  assert.deepEqual(contradictory.AND[0], { OR: [{ assignedToId: agent.id }, { createdById: agent.id }] });
});

test('схема отклоняет неизвестные поля сортировки и слишком длинную категорию', () => {
  for (const values of [
    { sort: 'passwordHash_asc' }, { sort: 'category_ascending' },
    { sort: 'title_asc,id_desc' }, { categoryId: 'x'.repeat(65) },
    { statusGroup: 'all' }, { assigneeRole: 'OWNER' },
  ]) assert.throws(() => query(admin, values), (error) => error.status === 400);
});
