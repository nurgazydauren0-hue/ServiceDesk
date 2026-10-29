import test from 'node:test';
import assert from 'node:assert/strict';
import { Auth } from '@auth/core';
import Credentials from '@auth/core/providers/credentials';
import { LoginServiceUnavailable, LoginRateLimited } from '../lib/login-errors.js';
import {
  registrationSchema,
  bootstrapAdminSchema,
  ticketCreateSchema,
  ticketUpdateSchema,
  commentSchema,
  profileUpdateSchema,
  teamUpdateSchema,
  parseBody,
  parseTicketFilters,
  parseId,
} from '../lib/validation.js';
import {
  ticketScope,
  canReadTicket,
  canEditTicket,
  canDeleteTicket,
  canManageTicket,
  assertTicketAccess,
} from '../lib/policies.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import { assertSameOrigin, readJsonBody } from '../lib/api-errors.js';

const employee = { id: 'employee-1', role: 'EMPLOYEE' };
const stranger = { id: 'employee-2', role: 'EMPLOYEE' };
const agent = { id: 'agent-1', role: 'AGENT' };
const otherAgent = { id: 'agent-2', role: 'AGENT' };
const admin = { id: 'admin-1', role: 'ADMIN' };
const ticket = { createdById: employee.id, assignedToId: null, status: 'NEW' };
const validRegistration = {
  name: 'Анна Иванова',
  email: 'anna@example.test',
  password: 'a long test password',
};
const validTicket = {
  title: 'Не работает Wi-Fi',
  description: 'На рабочем ноутбуке отсутствует соединение.',
  categoryId: 'category-1',
};
const isStatus = (status) => (error) => error.status === status;

test('регистрация нормализует email и отклоняет подмену роли / идентификатора', () => {
  const parsed = parseBody(registrationSchema, {
    ...validRegistration,
    name: '  Анна Иванова  ',
    email: ' ANNA@EXAMPLE.TEST ',
  });
  assert.equal(parsed.name, 'Анна Иванова');
  assert.equal(parsed.email, 'anna@example.test');
  for (const input of [
    null,
    [],
    {},
    { ...validRegistration, role: 'ADMIN' },
    { ...validRegistration, id: admin.id },
    { ...validRegistration, password: 'short' },
    { ...validRegistration, password: 'x'.repeat(129) },
    { ...validRegistration, email: 'incorrect' },
    { ...validRegistration, name: ' ' },
  ])
    assert.throws(() => parseBody(registrationSchema, input), isStatus(400));
});

test('пароль администратора из 11 символов не меняет правила регистрации', () => {
  const adminInput = { ...validRegistration, email: ' ADMIN@EXAMPLE.TEST ', password: 'x'.repeat(11) };
  assert.equal(parseBody(bootstrapAdminSchema, adminInput).email, 'admin@example.test');
  assert.throws(() => parseBody(registrationSchema, adminInput), isStatus(400));
  assert.throws(() => parseBody(bootstrapAdminSchema, { ...adminInput, password: 'x'.repeat(10) }), isStatus(400));
  assert.throws(() => parseBody(bootstrapAdminSchema, { ...adminInput, role: 'ADMIN' }), isStatus(400));
});

test('заявки и комментарии принимают предметные поля и ограничивают размер ввода', () => {
  assert.equal(parseBody(ticketCreateSchema, validTicket).priority, 'MEDIUM');
  for (const input of [
    { ...validTicket, title: ' ' },
    { ...validTicket, description: 'short' },
    { ...validTicket, categoryId: '' },
    { ...validTicket, priority: 'CRITICAL' },
    { ...validTicket, title: 'x'.repeat(161) },
    { ...validTicket, description: 'x'.repeat(5001) },
    { ...validTicket, createdById: stranger.id },
    { ...validTicket, status: 'RESOLVED' },
  ])
    assert.throws(() => parseBody(ticketCreateSchema, input), isStatus(400));
  for (const input of [
    {},
    { status: 'broken' },
    { createdById: stranger.id },
    { assignedToId: '' },
  ]) {
    assert.throws(() => parseBody(ticketUpdateSchema, input), isStatus(400));
  }
  assert.deepEqual(parseBody(ticketUpdateSchema, { assignedToId: null }), {
    assignedToId: null,
  });
  assert.equal(
    parseBody(commentSchema, { content: '  Проверено  ' }).content,
    'Проверено',
  );
  for (const input of [
    { content: '  ' },
    { content: 'x'.repeat(4001) },
    { content: 'Ответ', authorId: admin.id },
  ]) {
    assert.throws(() => parseBody(commentSchema, input), isStatus(400));
  }
});

test('профиль не позволяет самостоятельно назначить роль', () => {
  assert.throws(
    () => parseBody(profileUpdateSchema, { name: 'Анна', role: 'ADMIN' }),
    isStatus(400),
  );
  assert.throws(() => parseBody(profileUpdateSchema, {}), isStatus(400));
  assert.throws(
    () => parseBody(profileUpdateSchema, { newPassword: 'short' }),
    isStatus(400),
  );
  assert.deepEqual(parseBody(teamUpdateSchema, { role: 'AGENT' }), {
    role: 'AGENT',
  });
  assert.throws(
    () => parseBody(teamUpdateSchema, { role: 'OWNER' }),
    isStatus(400),
  );
});

test('фильтры и идентификаторы ограничивают разрешённые значения и пагинацию', () => {
  const parsed = parseTicketFilters(
    new URLSearchParams(
      'q=%20wi-fi%20&status=NEW&priority=HIGH&sort=oldest&page=2&pageSize=5&mine=1',
    ),
  );
  assert.equal(parsed.q, 'wi-fi');
  assert.equal(parsed.page, 2);
  assert.equal(parsed.pageSize, 5);
  assert.equal(parsed.mine, '1');
  for (const query of [
    'status=broken',
    'priority=broken',
    'sort=title',
    'page=0',
    'page=1.5',
    'pageSize=101',
    'mine=yes',
  ]) {
    assert.throws(
      () => parseTicketFilters(new URLSearchParams(query)),
      isStatus(400),
    );
  }
  assert.equal(parseId('42'), 42);
  for (const input of [
    'abc',
    '0',
    '-1',
    '1.5',
    '2147483648',
    '9007199254740992',
    '1 OR 1=1',
  ]) {
    assert.throws(() => parseId(input), isStatus(404));
  }
});

test('политика чтения изолирует сотрудника, исполнителя и администратора', () => {
  const assigned = { ...ticket, assignedToId: agent.id, status: 'IN_PROGRESS' };
  assert.ok(canReadTicket(employee, assigned));
  assert.ok(canReadTicket(agent, assigned));
  assert.ok(canReadTicket(admin, assigned));
  assert.equal(canReadTicket(stranger, assigned), false);
  assert.equal(canReadTicket(otherAgent, assigned), false);
  assert.throws(() => assertTicketAccess(stranger, assigned), isStatus(404));
  assert.throws(() => assertTicketAccess(admin, null), isStatus(404));
  assert.deepEqual(ticketScope(employee), { createdById: employee.id });
  assert.deepEqual(ticketScope(agent), {
    OR: [{ assignedToId: agent.id }, { createdById: agent.id }],
  });
  assert.deepEqual(ticketScope(admin), {});
});

test('автор редактирует только новую неназначенную заявку; управление доступно назначенному исполнителю', () => {
  assert.ok(canEditTicket(employee, ticket));
  assert.ok(canDeleteTicket(employee, ticket));
  assert.equal(canEditTicket(stranger, ticket), false);
  for (const changed of [
    { ...ticket, status: 'IN_PROGRESS' },
    { ...ticket, assignedToId: agent.id },
  ]) {
    assert.equal(canEditTicket(employee, changed), false);
    assert.equal(canDeleteTicket(employee, changed), false);
    assert.ok(canEditTicket(admin, changed));
    assert.ok(canDeleteTicket(admin, changed));
  }
  const assigned = { ...ticket, assignedToId: agent.id };
  assert.ok(canManageTicket(agent, assigned));
  assert.ok(canManageTicket(admin, assigned));
  assert.equal(canManageTicket(otherAgent, assigned), false);
  assert.equal(canManageTicket(employee, assigned), false);
  // Исполнитель, создающий собственную заявку, имеет права её автора.
  assert.ok(canEditTicket(agent, { ...ticket, createdById: agent.id }));
});

test('пароли имеют случайную соль, проверяются по хешу, повреждённые хеши отклоняются', async () => {
  const password = 'Длинный безопасный пароль';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(first.includes(password), false);
  assert.ok(await verifyPassword(password, first));
  assert.equal(await verifyPassword('Неверный пароль', first), false);
  for (const encoded of [
    null,
    '',
    password,
    'scrypt$1$8$1$salt$key',
    first.slice(0, -2),
    `${first}00`,
  ]) {
    assert.equal(await verifyPassword(password, encoded), false);
  }
  assert.equal(await verifyPassword(null, first), false);
});

test('Auth.js передаёт безопасные коды ошибок входа и сохраняет общую ошибку пароля', async () => {
  const origin = 'http://localhost:3000';
  const config = {
    secret: 'isolated-auth-unit-test-secret-at-least-32-characters',
    trustHost: true,
    basePath: '/api/auth',
    pages: { signIn: '/login' },
    logger: { error() {} },
    providers: [
      Credentials({
        authorize(credentials) {
          if (credentials.password === 'unavailable')
            throw new LoginServiceUnavailable();
          if (credentials.password === 'limited') throw new LoginRateLimited();
          if (credentials.password !== 'valid') return null;
          return { id: 'fixture-user', email: 'fixture@example.test' };
        },
      }),
    ],
  };
  for (const [password, expectedCode] of [
    ['incorrect', 'credentials'],
    ['unavailable', 'service_unavailable'],
    ['limited', 'rate_limited'],
    ['valid', null],
  ]) {
    const csrfResponse = await Auth(
      new Request(`${origin}/api/auth/csrf`),
      config,
    );
    const { csrfToken } = await csrfResponse.json();
    const cookie = csrfResponse.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const response = await Auth(
      new Request(`${origin}/api/auth/callback/credentials`, {
        method: 'POST',
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Auth-Return-Redirect': '1',
        },
        body: new URLSearchParams({
          csrfToken,
          password,
          callbackUrl: `${origin}/`,
        }),
      }),
      config,
    );
    const redirect = new URL((await response.json()).url);
    assert.equal(redirect.searchParams.get('code'), expectedCode);
    assert.equal(
      redirect.searchParams.get('error'),
      expectedCode ? 'CredentialsSignin' : null,
    );
    if (expectedCode) assert.equal(redirect.pathname, '/login');
    else
      assert.ok(response.headers.getSetCookie().some((value) =>
        value.startsWith('authjs.session-token='),
      ));
  }
});

test('запись отклоняет чужой Origin, даже если передан X-Forwarded-Host', () => {
  const makeRequest = (origin, extraHeaders = {}) =>
    new Request('http://localhost:3000/api/tickets', {
      method: 'POST',
      headers: { Origin: origin, Host: 'localhost:3000', ...extraHeaders },
    });
  assert.doesNotThrow(() =>
    assertSameOrigin(makeRequest('http://localhost:3000')),
  );
  for (const origin of [
    'https://evil.example',
    'null',
    'broken',
    'ftp://localhost:3000',
    'http://localhost:3001',
  ]) {
    assert.throws(() => assertSameOrigin(makeRequest(origin)), isStatus(403));
  }
  assert.throws(
    () =>
      assertSameOrigin(
        makeRequest('https://evil.example', {
          'X-Forwarded-Host': 'evil.example',
        }),
      ),
    isStatus(403),
  );
});

test('сервер различает повреждённый JSON, неверный Content-Type и слишком большое тело', async () => {
  const request = (body, contentType = 'application/json') =>
    new Request('http://localhost/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
    });
  assert.deepEqual(await readJsonBody(request('{"title":"Wi-Fi"}')), {
    title: 'Wi-Fi',
  });
  await assert.rejects(readJsonBody(request('{')), isStatus(400));
  await assert.rejects(
    readJsonBody(request('hello', 'text/plain')),
    isStatus(415),
  );
  await assert.rejects(
    readJsonBody(request(JSON.stringify({ content: 'я'.repeat(20000) }))),
    isStatus(413),
  );
});
