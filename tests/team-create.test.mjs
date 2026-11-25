import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBody, teamCreateSchema } from '../lib/validation.js';

const isStatus = (status) => (error) => error.status === status;
const valid = { name: 'Айгерим Сапарова', email: ' Aigerim@Company.KZ ', password: 'Temp-password-2026' };

test('администратор создаёт сотрудника с нормализованным email и ролью по умолчанию', () => {
  assert.deepEqual(parseBody(teamCreateSchema, valid), {
    name: 'Айгерим Сапарова',
    email: 'aigerim@company.kz',
    password: 'Temp-password-2026',
    role: 'EMPLOYEE',
  });
  assert.equal(parseBody(teamCreateSchema, { ...valid, role: 'AGENT' }).role, 'AGENT');
});

test('создание сотрудника требует пароль от 12 символов и отклоняет лишние поля', () => {
  assert.throws(() => parseBody(teamCreateSchema, { ...valid, password: 'short-pass' }), isStatus(400));
  assert.throws(() => parseBody(teamCreateSchema, { ...valid, role: 'OWNER' }), isStatus(400));
  assert.throws(() => parseBody(teamCreateSchema, { ...valid, passwordHash: 'x' }), isStatus(400));
  assert.throws(() => parseBody(teamCreateSchema, { ...valid, email: 'not-an-email' }), isStatus(400));
});
