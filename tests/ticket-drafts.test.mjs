import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_TICKET_DRAFT, hasTicketDraft, isCommentDraft, isTicketDraft } from '../lib/ticket-drafts.js';

test('черновик заявки допускает незаполненные поля и сохраняет существующие значения по умолчанию', () => {
  assert.deepEqual(EMPTY_TICKET_DRAFT, { title: '', description: '', categoryId: '', priority: 'MEDIUM' });
  assert.ok(isTicketDraft(EMPTY_TICKET_DRAFT));
  assert.equal(hasTicketDraft(EMPTY_TICKET_DRAFT), false);
  for (const priority of ['LOW', 'MEDIUM', 'HIGH', 'URGENT']) {
    assert.ok(isTicketDraft({ ...EMPTY_TICKET_DRAFT, priority }));
  }
  assert.ok(isTicketDraft({ ...EMPTY_TICKET_DRAFT, title: 'Н', description: ' ' }));
  assert.ok(hasTicketDraft({ ...EMPTY_TICKET_DRAFT, title: ' ' }));
  assert.ok(hasTicketDraft({ ...EMPTY_TICKET_DRAFT, priority: 'HIGH' }));
  assert.ok(hasTicketDraft({ ...EMPTY_TICKET_DRAFT, categoryId: 'category-1' }));
});

test('черновик заявки ограничивает размер каждого поля без обрезки текста', () => {
  const maximum = { title: 'x'.repeat(160), description: 'x'.repeat(5000), categoryId: 'x'.repeat(64), priority: 'URGENT' };
  assert.ok(isTicketDraft(maximum));
  for (const [field, length] of [['title', 161], ['description', 5001], ['categoryId', 65]]) {
    assert.equal(isTicketDraft({ ...maximum, [field]: 'x'.repeat(length) }), false);
  }
});

test('черновик не принимает дополнительные поля аккаунта, роли и неверные типы', () => {
  for (const value of [null, [], '', false, {}, { ...EMPTY_TICKET_DRAFT, priority: 'UNKNOWN' },
    { ...EMPTY_TICKET_DRAFT, title: 42 }, { ...EMPTY_TICKET_DRAFT, description: null },
    { ...EMPTY_TICKET_DRAFT, categoryId: [] }, { title: '', description: '', priority: 'MEDIUM' },
  ]) {
    assert.equal(isTicketDraft(value), false);
    assert.equal(hasTicketDraft(value), false);
  }
  for (const field of ['password', 'passwordHash', 'email', 'userId', 'role', 'assignedToId']) {
    assert.equal(isTicketDraft({ ...EMPTY_TICKET_DRAFT, [field]: 'unexpected' }), false);
  }
  assert.equal(isTicketDraft(JSON.parse('{"title":"","description":"","categoryId":"","priority":"MEDIUM","__proto__":{}}')), false);
});

test('черновик комментария хранит только строку до 4000 символов', () => {
  for (const value of ['', 'Незавершённый комментарий', ' ', 'x'.repeat(4000)])
    assert.equal(isCommentDraft(value), true);
  for (const value of [null, undefined, {}, { content: 'text' }, [], 0, 'x'.repeat(4001)])
    assert.equal(isCommentDraft(value), false);
});
