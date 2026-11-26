import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

// Never fall back to DATABASE_URL: these tests require an explicitly chosen test DB.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl)
  throw new Error(
    'Задайте TEST_DATABASE_URL отдельной PostgreSQL-базы и примените миграции перед интеграционными тестами. Рабочая DATABASE_URL не используется.',
  );
if (!['postgres:', 'postgresql:'].includes(new URL(testDatabaseUrl).protocol)) {
  throw new Error('TEST_DATABASE_URL должен указывать на PostgreSQL.');
}

const projectPath = fileURLToPath(new URL('../', import.meta.url));
const marker = `integration-${Date.now()}-${randomBytes(5).toString('hex')}`;
const password = randomBytes(24).toString('base64url');
const authSecret = randomBytes(48).toString('base64url');
const fixtureAddress = `2001:db8::${randomBytes(6).toString('hex').match(/.{4}/g).join(':')}`;
const elevationEmail = `elevate-${marker}@example.test`;
const users = {};
const extraCategoryIds = [];
let prisma;
let category;
let server;
let baseUrl;
let port;
let serverOutput = '';
let ticketId;
const fixtureEmails = [
  'employee',
  'stranger',
  'agent',
  'otherAgent',
  'admin',
].map((name) => `${name.toLowerCase()}-${marker}@example.test`);

const pause = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function freePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const available = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return available;
}

async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const stopped = new Promise((resolve) => server.once('exit', resolve));
  server.kill('SIGTERM');
  const timeout = setTimeout(() => server.kill('SIGKILL'), 5000);
  timeout.unref();
  await stopped;
  clearTimeout(timeout);
}

async function startServer() {
  port ||= await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverOutput = '';
  server = spawn(
    process.execPath,
    [
      join(projectPath, 'node_modules/next/dist/bin/next'),
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    {
      cwd: projectPath,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        DATABASE_URL: testDatabaseUrl,
        AUTH_SECRET: authSecret,
        AUTH_URL: baseUrl,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const appendOutput = (chunk) => {
    serverOutput = (serverOutput + chunk.toString()).slice(-8000);
  };
  server.stdout.on('data', appendOutput);
  server.stderr.on('data', appendOutput);
  let spawnError;
  server.once('error', (error) => {
    spawnError = error;
  });
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(
        `Тестовый сервер завершился. Сначала выполните npm run build.\n${serverOutput}`,
      );
    }
    try {
      const response = await fetch(`${baseUrl}/api/auth/csrf`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return;
    } catch {
      /* The port is not ready during startup. */
    }
    await pause(150);
  }
  throw new Error(
    `Тестовый сервер не запустился за 45 секунд.\n${serverOutput}`,
  );
}

class Client {
  cookies = new Map();

  async request(path, options = {}) {
    const headers = new Headers(options.headers);
    if (this.cookies.size)
      headers.set(
        'Cookie',
        [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '),
      );
    headers.set('X-Real-IP', fixtureAddress);
    if (options.method && options.method !== 'GET' && !headers.has('Origin'))
      headers.set('Origin', baseUrl);
    const response = await fetch(new URL(path, baseUrl), {
      ...options,
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
    const text = await response.text();
    let body = null;
    if (
      text &&
      response.headers.get('content-type')?.includes('application/json')
    )
      body = JSON.parse(text);
    return { response, body, text };
  }

  json(path, method, body, headers = {}) {
    return this.request(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  async login(email, suppliedPassword = password) {
    const csrf = await this.request('/api/auth/csrf');
    assert.equal(csrf.response.status, 200);
    const result = await this.request('/api/auth/callback/credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Auth-Return-Redirect': '1',
      },
      body: new URLSearchParams({
        csrfToken: csrf.body.csrfToken,
        email,
        password: suppliedPassword,
        callbackUrl: `${baseUrl}/dashboard`,
      }),
    });
    return result;
  }
}
const anonymous = new Client();

before(
  async () => {
    const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
      import('@prisma/client'),
      import('@prisma/adapter-pg'),
    ]);
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: testDatabaseUrl }),
    });
    await prisma.$connect();
    category = await prisma.category.create({ data: { name: marker } });
    await startServer();
    for (const [index, name] of [
      'employee',
      'stranger',
      'agent',
      'otherAgent',
      'admin',
    ].entries()) {
      const email = fixtureEmails[index];
      const registered = await anonymous.json('/api/register', 'POST', {
        name: `Тест ${name}`,
        email,
        password,
      });
      assert.equal(
        registered.response.status,
        201,
        `${name}: ${registered.text}\n${serverOutput}`,
      );
      assert.equal(registered.body.user.role, 'EMPLOYEE');
      assert.equal('passwordHash' in registered.body.user, false);
      const role =
        name === 'admin'
          ? 'ADMIN'
          : ['agent', 'otherAgent'].includes(name)
            ? 'AGENT'
            : 'EMPLOYEE';
      const user = await prisma.user.update({
        where: { email },
        data: { role },
      });
      const client = new Client();
      await client.login(email);
      const session = await client.request('/api/auth/session');
      assert.equal(
        session.body.user?.id,
        user.id,
        `Не создана сессия ${name}: ${JSON.stringify(session.body)}\n${serverOutput}`,
      );
      users[name] = { ...user, client };
    }
  },
  { timeout: 90_000 },
);

after(async () => {
  await stopServer();
  if (prisma) {
    // Only fixtures belonging to this run are removed; no database reset/truncate.
    const fixtureUsers = await prisma.user.findMany({
      where: { email: { in: [...fixtureEmails, elevationEmail] } },
      select: { id: true },
    });
    const userIds = fixtureUsers.map((user) => user.id);
    if (category)
      await prisma.ticket.deleteMany({ where: { categoryId: category.id } });
    if (userIds.length) {
      await prisma.supportRequest.deleteMany({ where: { authorId: { in: userIds } } });
      await prisma.comment.deleteMany({ where: { authorId: { in: userIds } } });
      await prisma.ticket.deleteMany({
        where: { createdById: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (category || extraCategoryIds.length)
      await prisma.category.deleteMany({
        where: {
          id: { in: [...extraCategoryIds, ...(category ? [category.id] : [])] },
        },
      });
    const rateLimitKeys = [...fixtureEmails, elevationEmail].flatMap((email) =>
      ['login', 'register-email'].map((action) =>
        createHash('sha256').update(`${action}:${email}`).digest('hex'),
      ),
    );
    rateLimitKeys.push(
      createHash('sha256')
        .update(`register-address:${fixtureAddress}`)
        .digest('hex'),
    );
    await prisma.authRateLimit.deleteMany({
      where: { id: { in: rateLimitKeys } },
    });
    await prisma.$disconnect();
  }
});

test(
  'ServiceDesk: реальные сессии, права и PostgreSQL',
  { timeout: 120_000 },
  async (t) => {
    const { employee, stranger, agent, otherAgent, admin } = users;

    await t.test(
      'закрытые API требуют входа, закрытая страница направляет на вход',
      async () => {
        for (const path of [
          '/api/tickets',
          '/api/tickets/filter-options',
          '/api/dashboard',
          '/api/profile',
          '/api/team',
          '/api/reports',
          '/api/notifications',
          '/api/notifications?scope=all&page=1',
        ]) {
          const result = await anonymous.request(path);
          assert.equal(result.response.status, 401, path);
        }
        const page = await anonymous.request('/tickets');
        assert.ok([302, 303, 307, 308].includes(page.response.status));
        assert.ok(page.response.headers.get('location')?.includes('/login'));
        const invalidLogin = new Client();
        await invalidLogin.login(employee.email, 'definitely-wrong-password');
        const session = await invalidLogin.request('/api/auth/session');
        assert.equal(session.body?.user, undefined);
      },
    );

    await t.test(
      'регистрация не повышает роль, email уникален, пароль хранится хешем',
      async () => {
        const duplicate = await anonymous.json('/api/register', 'POST', {
          name: 'Дубликат',
          email: employee.email.toUpperCase(),
          password,
        });
        assert.equal(duplicate.response.status, 409);
        const elevation = await anonymous.json('/api/register', 'POST', {
          name: 'Подмена роли',
          email: elevationEmail,
          password,
          role: 'ADMIN',
        });
        assert.equal(elevation.response.status, 400);
        assert.equal(
          await prisma.user.count({ where: { email: elevationEmail } }),
          0,
        );
        const stored = await prisma.user.findUnique({
          where: { id: employee.id },
        });
        assert.notEqual(stored.passwordHash, password);
        assert.ok(stored.passwordHash.startsWith('scrypt$'));
        const profile = await employee.client.request('/api/profile');
        assert.equal(profile.body.user.id, employee.id);
        assert.equal('passwordHash' in profile.body.user, false);
        const profileElevation = await employee.client.json(
          '/api/profile',
          'PATCH',
          { role: 'ADMIN' },
        );
        assert.equal(profileElevation.response.status, 400);
      },
    );

    await t.test(
      'создание и серверная валидация не доверяют автору и Origin из клиента',
      async () => {
        const input = {
          title: `Проверка Wi-Fi ${marker}`,
          description: 'Нет доступа к корпоративной сети на рабочем ноутбуке.',
          categoryId: category.id,
          priority: 'HIGH',
        };
        for (const changes of [
          { title: ' ' },
          { categoryId: 'nonexistent-category' },
          { priority: 'broken' },
          { createdById: stranger.id },
        ]) {
          const invalid = await employee.client.json('/api/tickets', 'POST', {
            ...input,
            ...changes,
          });
          assert.equal(invalid.response.status, 400, invalid.text);
        }
        const foreign = await employee.client.request('/api/tickets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://foreign.example',
          },
          body: JSON.stringify(input),
        });
        assert.equal(foreign.response.status, 403);
        const malformed = await employee.client.request('/api/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{',
        });
        assert.equal(malformed.response.status, 400);
        const created = await employee.client.json(
          '/api/tickets',
          'POST',
          input,
        );
        assert.equal(created.response.status, 201, created.text);
        ticketId = created.body.ticket.id;
        assert.equal(created.body.ticket.createdById, employee.id);
        assert.equal(created.body.ticket.status, 'NEW');
        assert.equal(created.body.ticket.assignedToId, null);
        assert.equal('passwordHash' in created.body.ticket.createdBy, false);
        assert.equal(
          (await prisma.ticket.findUnique({ where: { id: ticketId } })).title,
          input.title,
        );
      },
    );

    await t.test(
      'список и детали изолированы по ролям; фильтры и поиск работают на сервере',
      async () => {
        const query = `q=${encodeURIComponent(marker)}&status=NEW&priority=HIGH&sort=oldest&pageSize=5`;
        const own = await employee.client.request(`/api/tickets?${query}`);
        assert.equal(own.response.status, 200);
        assert.deepEqual(
          own.body.tickets.map((ticket) => ticket.id),
          [ticketId],
        );
        for (const user of [stranger, agent, otherAgent]) {
          const list = await user.client.request(
            `/api/tickets?q=${encodeURIComponent(marker)}`,
          );
          assert.deepEqual(list.body.tickets, []);
          for (const method of ['GET', 'PATCH', 'DELETE']) {
            const result =
              method === 'PATCH'
                ? await user.client.json(`/api/tickets/${ticketId}`, method, {
                    status: 'RESOLVED',
                  })
                : await user.client.request(`/api/tickets/${ticketId}`, {
                    method,
                  });
            assert.equal(result.response.status, 404);
          }
        }
        const filtered = await employee.client.request(
          `/api/tickets?q=${encodeURIComponent(marker)}&status=RESOLVED`,
        );
        assert.deepEqual(filtered.body.tickets, []);
        for (const queryString of [
          'status=broken',
          'sort=broken',
          'page=0',
          'pageSize=101',
        ]) {
          assert.equal(
            (await employee.client.request(`/api/tickets?${queryString}`))
              .response.status,
            400,
          );
        }
        assert.equal(
          (await employee.client.request('/api/tickets/not-a-number')).response
            .status,
          404,
        );
        const sql = await employee.client.request(
          `/api/tickets?q=${encodeURIComponent("' OR 1=1; DROP TABLE User; --")}`,
        );
        assert.equal(sql.response.status, 200);
        assert.deepEqual(sql.body.tickets, []);
        assert.equal(
          (await employee.client.request('/api/team')).response.status,
          403,
        );
        assert.equal(
          (await employee.client.request('/api/reports')).response.status,
          403,
        );
      },
    );

    await t.test(
      'автор меняет новую заявку; администратор назначает, исполнитель меняет только свой статус',
      async () => {
        assert.equal(
          (
            await employee.client.json(`/api/tickets/${ticketId}`, 'PATCH', {
              title: `Обновлённая заявка ${marker}`,
            })
          ).response.status,
          200,
        );
        for (const changes of [
          { assignedToId: agent.id },
          { status: 'RESOLVED' },
        ]) {
          assert.equal(
            (
              await employee.client.json(
                `/api/tickets/${ticketId}`,
                'PATCH',
                changes,
              )
            ).response.status,
            403,
          );
        }
        assert.equal(
          (
            await admin.client.json(`/api/tickets/${ticketId}`, 'PATCH', {
              assignedToId: stranger.id,
            })
          ).response.status,
          400,
        );
        const assignment = await admin.client.json(
          `/api/tickets/${ticketId}`,
          'PATCH',
          { assignedToId: agent.id },
        );
        assert.equal(assignment.response.status, 200, assignment.text);
        assert.equal(assignment.body.ticket.assignedTo.id, agent.id);
        assert.equal(
          (
            await employee.client.json(`/api/tickets/${ticketId}`, 'PATCH', {
              title: 'Изменить после назначения',
            })
          ).response.status,
          403,
        );
        assert.equal(
          (
            await employee.client.request(`/api/tickets/${ticketId}`, {
              method: 'DELETE',
            })
          ).response.status,
          403,
        );
        assert.equal(
          (
            await agent.client.json(`/api/tickets/${ticketId}`, 'PATCH', {
              title: 'Недопустимое изменение исполнителем',
            })
          ).response.status,
          403,
        );
        assert.equal(
          (
            await otherAgent.client.json(`/api/tickets/${ticketId}`, 'PATCH', {
              status: 'RESOLVED',
            })
          ).response.status,
          404,
        );
        const progress = await agent.client.json(
          `/api/tickets/${ticketId}`,
          'PATCH',
          { status: 'IN_PROGRESS' },
        );
        assert.equal(progress.response.status, 200, progress.text);
        assert.equal(progress.body.ticket.status, 'IN_PROGRESS');
        const team = await admin.client.request('/api/team');
        const member = team.body.users.find((user) => user.id === agent.id);
        assert.equal(member.assignedCount, 1);
        assert.equal(member.openAssignedCount, 1);
      },
    );

    await t.test(
      'пользователи фильтра исполнителя ограничены доступными заявками',
      async () => {
        for (const viewer of [employee, agent]) {
          const options = await viewer.client.request('/api/tickets/filter-options');
          assert.equal(options.response.status, 200, options.text);
          assert.deepEqual(options.body.users, [{
            id: agent.id, name: agent.name, role: agent.role,
          }]);
        }
        for (const viewer of [stranger, otherAgent]) {
          const options = await viewer.client.request('/api/tickets/filter-options');
          assert.equal(options.response.status, 200, options.text);
          assert.deepEqual(options.body.users, []);
        }
        const adminOptions = await admin.client.request('/api/tickets/filter-options');
        assert.equal(adminOptions.response.status, 200, adminOptions.text);
        for (const member of [employee, stranger, agent, otherAgent, admin])
          assert.ok(adminOptions.body.users.some((entry) => entry.id === member.id));
        assert.ok(adminOptions.body.users.every((entry) =>
          Object.keys(entry).sort().join(',') === 'id,name,role'));

        const matching = await employee.client.request(
          `/api/tickets?assignedToId=${agent.id}&assigneeRole=AGENT&pageSize=1`,
        );
        assert.equal(matching.response.status, 200, matching.text);
        assert.equal(matching.body.total, 1);
        assert.deepEqual(matching.body.tickets.map((ticket) => ticket.id), [ticketId]);
        for (const query of [
          `assignedToId=${otherAgent.id}`,
          `assignedToId=${agent.id}&assigneeRole=ADMIN`,
        ]) {
          const unmatched = await employee.client.request(`/api/tickets?${query}`);
          assert.equal(unmatched.response.status, 200, unmatched.text);
          assert.equal(unmatched.body.total, 0);
          assert.deepEqual(unmatched.body.tickets, []);
        }
      },
    );

    await t.test(
      'комментарии сохраняют настоящего автора и недоступны посторонним',
      async () => {
        const path = `/api/tickets/${ticketId}/comments`;
        const reply = await agent.client.json(path, 'POST', {
          content: 'Проверяю сетевое оборудование.',
        });
        assert.equal(reply.response.status, 201, reply.text);
        assert.equal(reply.body.comment.authorId, agent.id);
        assert.equal('passwordHash' in reply.body.comment.author, false);
        assert.equal(
          (
            await employee.client.json(path, 'POST', {
              content: 'Спасибо, ожидаю решения.',
            })
          ).response.status,
          201,
        );
        assert.equal(
          (
            await stranger.client.json(path, 'POST', {
              content: 'Чужой комментарий',
            })
          ).response.status,
          404,
        );
        assert.equal(
          (
            await employee.client.json(path, 'POST', {
              content: 'Подменённый автор',
              authorId: admin.id,
            })
          ).response.status,
          400,
        );
        assert.equal(
          (await employee.client.json(path, 'POST', { content: ' ' })).response
            .status,
          400,
        );
        const detail = await employee.client.request(
          `/api/tickets/${ticketId}`,
        );
        assert.equal(detail.body.ticket.comments.length, 2);
        assert.equal(await prisma.comment.count({ where: { ticketId } }), 2);
      },
    );

    await t.test(
      'профиль сохраняет имя; категории изменяет только администратор',
      async () => {
        const renamed = await employee.client.json('/api/profile', 'PATCH', {
          name: 'Обновлённое имя сотрудника',
        });
        assert.equal(renamed.response.status, 200, renamed.text);
        assert.equal(
          (await employee.client.request('/api/profile')).body.user.name,
          'Обновлённое имя сотрудника',
        );
        assert.equal(
          (await prisma.user.findUnique({ where: { id: employee.id } })).name,
          'Обновлённое имя сотрудника',
        );
        const sensitive = await employee.client.json('/api/profile', 'PATCH', {
          newPassword: 'another long password',
          currentPassword: 'incorrect',
        });
        assert.equal(sensitive.response.status, 400);
        for (const user of [employee, agent]) {
          assert.equal(
            (
              await user.client.json('/api/categories', 'POST', {
                name: `Запрещённая ${marker}`,
              })
            ).response.status,
            403,
          );
          assert.equal(
            (
              await user.client.json(
                `/api/categories/${category.id}`,
                'PATCH',
                { name: `Подмена ${marker}` },
              )
            ).response.status,
            403,
          );
        }
        const createdCategory = await admin.client.json(
          '/api/categories',
          'POST',
          { name: `Дополнительная ${marker}` },
        );
        assert.equal(
          createdCategory.response.status,
          201,
          createdCategory.text,
        );
        const categoryId = createdCategory.body.category.id;
        extraCategoryIds.push(categoryId);
        const renamedCategory = await admin.client.json(
          `/api/categories/${categoryId}`,
          'PATCH',
          { name: `Изменённая ${marker}` },
        );
        assert.equal(renamedCategory.response.status, 200);
        const listed = await employee.client.request('/api/categories');
        assert.ok(
          listed.body.categories.some(
            (entry) =>
              entry.id === categoryId && entry.name === `Изменённая ${marker}`,
          ),
        );
        assert.equal(
          (
            await admin.client.request(`/api/categories/${category.id}`, {
              method: 'DELETE',
            })
          ).response.status,
          409,
        );
        assert.equal(
          (
            await admin.client.request(`/api/categories/${categoryId}`, {
              method: 'DELETE',
            })
          ).response.status,
          204,
        );
        assert.equal(
          await prisma.category.count({ where: { id: categoryId } }),
          0,
        );
      },
    );
    await t.test(
      'Dashboard и отчёты совпадают с PostgreSQL и учитывают область доступа',
      async () => {
        for (const user of [employee, stranger, agent, admin]) {
          const dashboard = await user.client.request('/api/dashboard');
          assert.equal(dashboard.response.status, 200, dashboard.text);
          const where =
            user.role === 'ADMIN'
              ? {}
              : user.role === 'AGENT'
                ? { OR: [{ createdById: user.id }, { assignedToId: user.id }] }
                : { createdById: user.id };
          assert.equal(
            dashboard.body.counts.total,
            await prisma.ticket.count({ where }),
          );
          assert.equal(
            dashboard.body.statuses.reduce((sum, row) => sum + row.count, 0),
            dashboard.body.counts.total,
          );
          assert.equal(
            dashboard.body.priorities.reduce((sum, row) => sum + row.count, 0),
            dashboard.body.counts.total,
          );
        }
        assert.equal(
          (await agent.client.request('/api/team')).response.status,
          403,
        );
        assert.equal(
          (await agent.client.request('/api/reports')).response.status,
          403,
        );
        const reports = await admin.client.request('/api/reports');
        assert.equal(reports.response.status, 200, reports.text);
        assert.equal(reports.body.counts.total, await prisma.ticket.count());
      },
    );

    await t.test(
      'архив уведомлений включает старые события, сохраняет права и не повторяет страницы',
      async () => {
        const oldDate = new Date(Date.now() - 45 * 86_400_000);
        const archived = await prisma.ticket.createManyAndReturn({
          data: Array.from({ length: 60 }, (_, index) => ({
            title: `${marker} archive ${index}`,
            description: 'Historical notification fixture for pagination and access checks.',
            categoryId: category.id,
            createdById: index < 30 ? employee.id : stranger.id,
            assignedToId: index < 30 ? agent.id : otherAgent.id,
            status: 'RESOLVED',
            createdAt: oldDate,
            updatedAt: oldDate,
            resolvedAt: oldDate,
          })),
          select: { id: true, createdById: true },
        });
        const archivedIds = new Set(archived.map((entry) => entry.id));
        const ownIds = new Set(archived.filter((entry) => entry.createdById === employee.id).map((entry) => entry.id));
        const recent = await admin.client.request('/api/notifications');
        assert.equal(recent.response.status, 200, recent.text);
        assert.ok(recent.body.notifications.every((entry) => !archivedIds.has(entry.ticketId)));

        for (const viewer of [admin, employee, agent]) {
          const entries = [];
          let asOf;
          for (let page = 1; page <= 10; page += 1) {
            const query = new URLSearchParams({ scope: 'all', page: String(page) });
            if (asOf) query.set('asOf', asOf);
            const result = await viewer.client.request(`/api/notifications?${query}`);
            assert.equal(result.response.status, 200, result.text);
            assert.equal(result.body.pageSize, 20);
            assert.equal(result.body.page, page);
            assert.equal(result.body.since, null);
            if (asOf) assert.equal(result.body.generatedAt, asOf);
            asOf = result.body.generatedAt;
            entries.push(...result.body.notifications);
            if (!result.body.hasMore) break;
            assert.ok(page < 10, 'Archive pagination did not finish');
          }
          assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length);
          const restored = entries.filter((entry) => archivedIds.has(entry.ticketId));
          assert.equal(restored.length, viewer.role === 'ADMIN' ? 60 : 30);
          assert.ok(restored.every((entry) => entry.type === 'ticket_created'));
          if (viewer.role !== 'ADMIN') assert.ok(restored.every((entry) => ownIds.has(entry.ticketId)));
        }
        for (const query of ['scope=all&page=0', 'scope=invalid', 'scope=all&page=1&page=2']) {
          assert.equal((await admin.client.request(`/api/notifications?${query}`)).response.status, 400);
        }
        const page = await admin.client.request('/notifications');
        assert.equal(page.response.status, 200, page.text);
      },
    );

    await t.test(
      'смена роли проверяется по базе в уже существующей сессии',
      async () => {
        const blockedDemotion = await admin.client.json(
          `/api/team/${agent.id}`,
          'PATCH',
          { role: 'EMPLOYEE' },
        );
        assert.equal(blockedDemotion.response.status, 409);
        assert.equal(
          (
            await employee.client.json(`/api/team/${stranger.id}`, 'PATCH', {
              role: 'ADMIN',
            })
          ).response.status,
          403,
        );
        assert.equal(
          (
            await agent.client.json(`/api/tickets/${ticketId}`, 'PATCH', {
              status: 'RESOLVED',
            })
          ).response.status,
          200,
        );
        const demoted = await admin.client.json(
          `/api/team/${agent.id}`,
          'PATCH',
          { role: 'EMPLOYEE' },
        );
        assert.equal(demoted.response.status, 200, demoted.text);
        assert.equal(
          (await agent.client.request(`/api/tickets/${ticketId}`)).response
            .status,
          404,
        );
        assert.equal(
          (
            await agent.client.json(`/api/tickets/${ticketId}`, 'PATCH', {
              status: 'CLOSED',
            })
          ).response.status,
          404,
        );
        assert.equal(
          (await agent.client.request('/api/profile')).body.user.role,
          'EMPLOYEE',
        );
      },
    );

    await t.test(
      'заявку можно отправить в центр поддержки; обрабатывает только администратор',
      async () => {
        const path = `/api/tickets/${ticketId}/support-requests`;
        const created = await employee.client.json(path, 'POST', {
          type: 'QUALITY',
          message: `Проблема вернулась ${marker}`,
        });
        assert.equal(created.response.status, 201, created.text);
        const requestId = created.body.request.id;
        assert.equal(created.body.request.status, 'OPEN');
        assert.equal(created.body.request.authorId, employee.id);
        // One active request per ticket and author.
        assert.equal(
          (await employee.client.json(path, 'POST', { type: 'COMPLAINT', message: 'Вторая жалоба подряд' })).response.status,
          409,
        );
        // A stranger cannot send or read requests of someone else's ticket.
        assert.equal(
          (await stranger.client.json(path, 'POST', { type: 'QUESTION', message: 'Вопрос по чужой заявке' })).response.status,
          404,
        );
        assert.equal((await stranger.client.request(path)).response.status, 404);
        // The assigned agent reads the ticket but not a complaint written by someone else;
        // the admin sees it. (agent was demoted above, so otherAgent is assigned for this check.)
        const assign = (assignedToId) =>
          admin.client.json(`/api/tickets/${ticketId}`, 'PATCH', { assignedToId });
        assert.equal((await assign(otherAgent.id)).response.status, 200);
        const agentView = await otherAgent.client.request(path);
        assert.equal(agentView.response.status, 200, agentView.text);
        assert.deepEqual(agentView.body.requests, []);
        // agent is an EMPLOYEE now and cannot be assigned through the API; restore the fixture directly.
        await prisma.ticket.update({ where: { id: ticketId }, data: { assignedToId: agent.id } });
        assert.equal((await admin.client.request(path)).body.requests.length, 1);
        const update = `/api/support/requests/${requestId}`;
        for (const user of [employee, agent])
          assert.equal((await user.client.json(update, 'PATCH', { status: 'IN_REVIEW' })).response.status, 403);
        assert.equal((await admin.client.json(update, 'PATCH', { status: 'RESOLVED' })).response.status, 400);
        const resolved = await admin.client.json(update, 'PATCH', {
          status: 'RESOLVED',
          response: 'Проверили, исполнитель переделает.',
        });
        assert.equal(resolved.response.status, 200, resolved.text);
        assert.equal(resolved.body.request.handledById, admin.id);
        assert.ok(resolved.body.request.resolvedAt);
        const support = await employee.client.request('/api/support');
        assert.ok(support.body.mine.some((item) => item.id === requestId && item.response));
        // The support center page offers exactly the tickets the user may see.
        assert.ok(support.body.tickets.some((item) => item.id === ticketId));
        assert.equal((await stranger.client.request('/api/support')).body.tickets.some((item) => item.id === ticketId), false);
        const adminView = await admin.client.request('/api/support');
        assert.equal(adminView.body.role, 'ADMIN');
        assert.ok(adminView.body.resolved.some((item) => item.id === requestId));
        assert.equal(adminView.body.active.some((item) => item.id === requestId), false);
        // After an answer the author may write again.
        assert.equal(
          (await employee.client.json(path, 'POST', { type: 'QUESTION', message: 'Новый вопрос после ответа' })).response.status,
          201,
        );
      },
    );

    await t.test(
      'заявка и комментарии остаются после перезапуска Next.js',
      async () => {
        await stopServer();
        await startServer();
        const saved = await employee.client.request(`/api/tickets/${ticketId}`);
        assert.equal(
          saved.response.status,
          200,
          `${saved.text}\n${serverOutput}`,
        );
        assert.equal(saved.body.ticket.status, 'RESOLVED');
        assert.equal(saved.body.ticket.comments.length, 2);
        assert.equal(saved.body.ticket.assignedToId, agent.id);
      },
    );

    await t.test(
      'администратор удаляет заявку с комментариями, выход закрывает API',
      async () => {
        assert.equal(
          (
            await admin.client.request(`/api/tickets/${ticketId}`, {
              method: 'DELETE',
            })
          ).response.status,
          204,
        );
        assert.equal(await prisma.ticket.count({ where: { id: ticketId } }), 0);
        assert.equal(await prisma.comment.count({ where: { ticketId } }), 0);
        assert.equal(await prisma.supportRequest.count({ where: { ticketId } }), 0);
        assert.equal(
          (await employee.client.request(`/api/tickets/${ticketId}`)).response
            .status,
          404,
        );
        const csrf = await employee.client.request('/api/auth/csrf');
        await employee.client.request('/api/auth/signout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Auth-Return-Redirect': '1',
          },
          body: new URLSearchParams({
            csrfToken: csrf.body.csrfToken,
            callbackUrl: `${baseUrl}/login`,
          }),
        });
        assert.equal(
          (await employee.client.request('/api/tickets')).response.status,
          401,
        );
      },
    );
  },
);
