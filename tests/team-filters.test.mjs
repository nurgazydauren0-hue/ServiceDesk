import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTeamUsers } from '../lib/team-filters.js';

const users = [
  { id: 'employee', name: 'Анна', email: 'anna@example.test', role: 'EMPLOYEE', openAssignedCount: 0 },
  { id: 'admin', name: 'Борис', email: 'boris@example.test', role: 'ADMIN', openAssignedCount: 1 },
  { id: 'agent-b', name: 'Яна', email: 'yana@example.test', role: 'AGENT', openAssignedCount: 5 },
  { id: 'agent-a', name: 'Вера', email: 'vera@example.test', role: 'AGENT', openAssignedCount: 2 },
];

test('исполнители выводятся первыми, исходные данные не меняются', () => {
  const before = users.map(({ id }) => id);
  const result = filterTeamUsers(users);
  assert.deepEqual(result.map(({ id }) => id), ['agent-a', 'agent-b', 'admin', 'employee']);
  assert.deepEqual(users.map(({ id }) => id), before);
});

test('фильтр роли работает вместе с поиском по имени и email', () => {
  assert.deepEqual(
    filterTeamUsers(users, { role: 'AGENT', search: ' VERA@ ' }).map(({ id }) => id),
    ['agent-a'],
  );
  assert.deepEqual(filterTeamUsers(users, { role: 'EMPLOYEE', search: 'Яна' }), []);
  assert.equal(filterTeamUsers(users, { role: 'ADMIN' })[0].id, 'admin');
});

test('сортировка по нагрузке и имени доступна после выбора роли', () => {
  assert.deepEqual(
    filterTeamUsers(users, { role: 'AGENT', sort: 'workload' }).map(({ id }) => id),
    ['agent-b', 'agent-a'],
  );
  assert.deepEqual(
    filterTeamUsers(users, { sort: 'name' }).map(({ id }) => id),
    ['employee', 'admin', 'agent-a', 'agent-b'],
  );
});
