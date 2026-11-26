import test from 'node:test';
import assert from 'node:assert/strict';
import { supportRequestCreateSchema, supportRequestUpdateSchema } from '../lib/validation.js';

test('a support request needs a known type and a real message', () => {
  assert.deepEqual(
    supportRequestCreateSchema.parse({ type: 'COMPLAINT', message: '  Заявку не решают неделю  ' }),
    { type: 'COMPLAINT', message: 'Заявку не решают неделю' },
  );
  assert.equal(supportRequestCreateSchema.safeParse({ type: 'SPAM', message: 'Заявку не решают неделю' }).success, false);
  assert.equal(supportRequestCreateSchema.safeParse({ type: 'QUESTION', message: 'коротко' }).success, false);
  assert.equal(supportRequestCreateSchema.safeParse({ type: 'QUESTION', message: 'x'.repeat(2001) }).success, false);
  // Unknown fields such as a forged author are rejected, not ignored.
  assert.equal(supportRequestCreateSchema.safeParse({ type: 'QUESTION', message: 'Нужно разъяснение', authorId: 'x' }).success, false);
});

test('closing a support request requires an answer to the user', () => {
  assert.equal(supportRequestUpdateSchema.safeParse({ status: 'IN_REVIEW' }).success, true);
  assert.equal(supportRequestUpdateSchema.safeParse({ status: 'RESOLVED' }).success, false);
  assert.equal(supportRequestUpdateSchema.safeParse({ status: 'RESOLVED', response: '  ' }).success, false);
  assert.deepEqual(
    supportRequestUpdateSchema.parse({ status: 'RESOLVED', response: ' Разобрались, исполнитель заменён. ' }),
    { status: 'RESOLVED', response: 'Разобрались, исполнитель заменён.' },
  );
  assert.equal(supportRequestUpdateSchema.safeParse({ status: 'DONE' }).success, false);
});
