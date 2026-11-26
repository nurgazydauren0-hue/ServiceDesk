import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAdminConsole,
  buildAgentDesk,
  buildRequesterHelp,
  compareByUrgency,
  conversationState,
} from '../lib/support-center.js';

const now = new Date('2026-11-26T12:00:00Z');
const hoursAgo = (hours) => new Date(now.getTime() - hours * 3600000);
const employee = { id: 'emp', name: 'Сотрудник', role: 'EMPLOYEE' };
const agent = { id: 'agent', name: 'Айтишник', role: 'AGENT' };

function ticket(overrides = {}) {
  return {
    id: 1,
    title: 'Не работает принтер',
    status: 'NEW',
    priority: 'MEDIUM',
    createdAt: hoursAgo(3),
    createdById: employee.id,
    createdBy: employee,
    assignedToId: null,
    assignedTo: null,
    category: { id: 'c1', name: 'Оборудование' },
    comments: [],
    _count: { comments: 0 },
    ...overrides,
  };
}
const comment = (author, hours, content = 'Сообщение') => ({
  id: `${author.id}-${hours}`,
  authorId: author.id,
  author,
  content,
  createdAt: hoursAgo(hours),
});

test('a request without replies waits for support since it was created', () => {
  const state = conversationState(ticket(), now);
  assert.equal(state.awaitingSupport, true);
  assert.equal(state.awaitingRequester, false);
  assert.equal(state.waitingHours, 3);
  assert.equal(state.overdue, false);
  assert.equal(state.lastMessage, null);
});

test('after a staff reply support keeps working unless it asked the requester', () => {
  const state = conversationState(ticket({ status: 'IN_PROGRESS', comments: [comment(agent, 1)] }), now);
  assert.equal(state.awaitingSupport, false);
  assert.equal(state.awaitingRequester, false);
  assert.equal(state.supportWorking, true);
  assert.equal(state.supportReplied, true);
  assert.equal(state.lastMessage.author.name, agent.name);
});

test('a requester reply hands the turn back to support', () => {
  const state = conversationState(ticket({ status: 'IN_PROGRESS', comments: [comment(employee, 1)] }), now);
  assert.equal(state.awaitingSupport, true);
  assert.equal(state.supportReplied, false);
});

test('WAITING always means support waits for the requester', () => {
  const state = conversationState(ticket({ status: 'WAITING', comments: [comment(employee, 1)] }), now);
  assert.equal(state.awaitingSupport, false);
  assert.equal(state.awaitingRequester, true);
});

test('overdue follows the first response target of the priority', () => {
  assert.equal(conversationState(ticket({ priority: 'URGENT', createdAt: hoursAgo(3) }), now).overdue, true);
  assert.equal(conversationState(ticket({ priority: 'LOW', createdAt: hoursAgo(3) }), now).overdue, false);
});

test('closed requests wait for nobody', () => {
  const state = conversationState(ticket({ status: 'RESOLVED', createdAt: hoursAgo(500) }), now);
  assert.equal(state.open, false);
  assert.equal(state.awaitingSupport, false);
  assert.equal(state.overdue, false);
});

test('long messages are shortened for the preview', () => {
  const state = conversationState(ticket({ comments: [comment(employee, 1, 'а'.repeat(400))] }), now);
  assert.equal(state.lastMessage.content.length, 160);
  assert.ok(state.lastMessage.content.endsWith('…'));
});

test('urgency order: overdue, then priority, then longest wait', () => {
  const items = [
    { id: 1, overdue: false, priority: 'URGENT', waitingSince: hoursAgo(1).toISOString() },
    { id: 2, overdue: true, priority: 'LOW', waitingSince: hoursAgo(100).toISOString() },
    { id: 3, overdue: false, priority: 'URGENT', waitingSince: hoursAgo(1.5).toISOString() },
  ].sort(compareByUrgency);
  assert.deepEqual(items.map((item) => item.id), [2, 3, 1]);
});

test('administrator console counts the whole line and the workload', () => {
  const tickets = [
    ticket({ id: 1 }),
    ticket({ id: 2, priority: 'URGENT', createdAt: hoursAgo(5), assignedToId: agent.id, assignedTo: agent }),
    ticket({ id: 3, status: 'WAITING', assignedToId: agent.id, assignedTo: agent, comments: [comment(agent, 2)] }),
    ticket({ id: 4, status: 'CLOSED' }),
  ];
  const activity = [{ ...comment(agent, 2), ticket: { id: 3, title: 'x', createdById: employee.id } }];
  const data = buildAdminConsole({ tickets, staff: [agent], resolvedToday: 2, activity }, now);
  assert.deepEqual(data.kpis, { awaitingReply: 2, overdue: 1, unassigned: 1, waitingRequester: 1, resolvedToday: 2 });
  assert.deepEqual(data.inbox.map((item) => item.id), [2, 1]);
  assert.deepEqual(data.unassigned.map((item) => item.id), [1]);
  assert.deepEqual(data.workload, [{ id: 'agent', name: 'Айтишник', role: 'AGENT', open: 2, awaitingReply: 1, overdue: 1, urgent: 1 }]);
  assert.equal(data.activity[0].fromRequester, false);
});

test('IT specialist desk only shows own tickets, split by next step', () => {
  const tickets = [
    ticket({ id: 1, assignedToId: agent.id }),
    ticket({ id: 2, status: 'IN_PROGRESS', assignedToId: agent.id, comments: [comment(agent, 1)] }),
    ticket({ id: 3, status: 'WAITING', assignedToId: agent.id }),
    ticket({ id: 4, assignedToId: 'someone-else' }),
  ];
  const data = buildAgentDesk({ tickets, userId: agent.id, resolvedWeek: 4 }, now);
  assert.deepEqual(data.reply.map((item) => item.id), [1]);
  assert.deepEqual(data.inWork.map((item) => item.id), [2]);
  assert.deepEqual(data.waiting.map((item) => item.id), [3]);
  assert.equal(data.kpis.resolvedWeek, 4);
});

test('help center puts requests waiting for the user first and "Другое" last', () => {
  const tickets = [
    ticket({ id: 1, createdAt: hoursAgo(1) }),
    ticket({ id: 2, status: 'WAITING', comments: [comment(agent, 5)] }),
    ticket({ id: 3, status: 'RESOLVED' }),
    ticket({ id: 4, status: 'IN_PROGRESS', comments: [comment(agent, 0.5)] }),
  ];
  const categories = [{ id: 'c0', name: 'Другое' }, { id: 'c1', name: 'Оборудование' }];
  const data = buildRequesterHelp({ tickets, categories, userId: employee.id }, now);
  assert.deepEqual(data.active.map((item) => item.id), [2, 4, 1]);
  assert.deepEqual(data.categories.map((item) => item.name), ['Оборудование', 'Другое']);
  assert.deepEqual(data.kpis, { active: 3, newReplies: 1, resolved: 1 });
  assert.deepEqual(data.resolved.map((item) => item.id), [3]);
});
