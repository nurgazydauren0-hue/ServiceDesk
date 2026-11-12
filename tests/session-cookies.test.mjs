import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encode } from 'next-auth/jwt';
import { getInvalidSessionCookies, parseSessionCookies, SESSION_COOKIE_BASES } from '../lib/session-cookies.js';

const secret = randomBytes(32).toString('base64url');
const previousSecret = randomBytes(32).toString('base64url');
const [plain, secure] = SESSION_COOKIE_BASES;
const tokenFor = (base, key = secret, options = {}) => encode({
  token: { sub: 'session-cookie-test', ...options.token },
  secret: key,
  salt: base,
  ...(options.maxAge === undefined ? {} : { maxAge: options.maxAge }),
});

test('raw Cookie parser сохраняет session пары и декодирует значения как Auth.js', () => {
  const header = `theme=dark; broken-pair; \t${plain} \t= \tfirst%2Evalue%3D \t; authjs.csrf-token=csrf; ${secure}.0=encoded%25; ${plain}=second`;
  assert.deepEqual(parseSessionCookies(header), [
    { name: plain, value: 'first.value=' },
    { name: `${secure}.0`, value: 'encoded%' },
    { name: plain, value: 'second' },
  ]);
  assert.deepEqual(parseSessionCookies(null), []);
  assert.deepEqual(parseSessionCookies(undefined), []);
  assert.deepEqual(parseSessionCookies(''), []);
  assert.deepEqual(parseSessionCookies('theme=dark; broken-pair; authjs.csrf-token=csrf'), []);
});

test('неправильный percent encoding не исчезает и сессия очищается', async () => {
  const cookies = parseSessionCookies(`${plain}=%E0%A4%A; servicedesk-theme=dark`);
  assert.deepEqual(cookies, [{ name: plain, value: '%E0%A4%A' }]);
  assert.deepEqual(await getInvalidSessionCookies(cookies, secret), [plain]);
});

test('duplicate names сохраняются и неоднозначная сессия очищается в обоих порядках', async () => {
  const valid = await tokenFor(plain);
  for (const values of [['garbage', valid], [valid, 'garbage']]) {
    const cookies = parseSessionCookies(values.map((value) => `${plain}=${value}`).join('; '));
    assert.equal(cookies.length, 2);
    assert.deepEqual(cookies.map(({ name }) => name), [plain, plain]);
    assert.deepEqual(await getInvalidSessionCookies(cookies, secret), [plain]);
  }
});

test('действующее percent encoded значение сохраняется, а кавычки отвергаются как в Auth.js', async () => {
  const value = await tokenFor(secure);
  const encoded = value.replaceAll('.', '%2E');
  assert.deepEqual(await getInvalidSessionCookies(parseSessionCookies(`${secure}=${encoded}`), secret), []);
  const quoted = parseSessionCookies(`${secure}="${value}"`);
  assert.equal(quoted[0].value, `"${value}"`);
  assert.deepEqual(await getInvalidSessionCookies(quoted, secret), [secure]);
  assert.deepEqual(await getInvalidSessionCookies(parseSessionCookies(`${plain}=`), secret), [plain]);
});

test('без session cookies декодер не вызывается и другие cookies сохраняются', async () => {
  const cookies = [
    { name: 'authjs.csrf-token', value: 'csrf-fixture' },
    { name: '__Host-authjs.csrf-token', value: 'secure-csrf-fixture' },
    { name: 'authjs.callback-url', value: 'http://localhost:3000/' },
    { name: 'servicedesk-theme', value: 'dark' },
  ];
  const unexpectedDecode = () => { throw new Error('Unexpected session decode'); };
  assert.deepEqual(await getInvalidSessionCookies(cookies, secret, unexpectedDecode), []);
  assert.deepEqual(await getInvalidSessionCookies([], secret, unexpectedDecode), []);
});

test('действующие HTTP и HTTPS сессии проверяются с отдельной солью и не очищаются', async () => {
  const cookies = Object.freeze([
    Object.freeze({ name: plain, value: await tokenFor(plain) }),
    Object.freeze({ name: secure, value: await tokenFor(secure) }),
    Object.freeze({ name: 'servicedesk-theme', value: 'dark' }),
  ]);
  assert.deepEqual(await getInvalidSessionCookies(cookies, secret), []);
});

test('сессия со старым секретом очищается без удаления CSRF и действующей сессии', async () => {
  const cookies = [
    { name: 'authjs.csrf-token', value: 'csrf-fixture' },
    { name: secure, value: await tokenFor(secure, previousSecret) },
    { name: plain, value: await tokenFor(plain) },
    { name: 'servicedesk-theme', value: 'dark' },
  ];
  assert.deepEqual(await getInvalidSessionCookies(cookies, secret), [secure]);
});

test('истёкшая сессия очищается с учётом допустимого Auth.js отклонения часов', async () => {
  const cookies = [{ name: plain, value: await tokenFor(plain, secret, { maxAge: -60 }) }];
  assert.deepEqual(await getInvalidSessionCookies(cookies, secret), [plain]);
});

test('пустые, некорректные и повреждённые session cookies очищаются', async () => {
  const parts = (await tokenFor(plain)).split('.');
  parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1);
  for (const value of ['', 'garbage', 'a.b.c.d.e', parts.join('.')]) {
    assert.deepEqual(await getInvalidSessionCookies([{ name: plain, value }], secret), [plain]);
  }
});

test('chunks собираются по числовому индексу, включая 10 и 11, без изменения запроса', async () => {
  const value = await tokenFor(secure, secret, { token: { padding: 'x'.repeat(1200) } });
  const chunks = Array.from({ length: 12 }, (_, index) => Object.freeze({
    name: `${secure}.${index}`,
    value: value.slice(Math.floor(value.length * index / 12), Math.floor(value.length * (index + 1) / 12)),
  }));
  // Lexical order puts .10 before .2; Auth.js requires numeric order.
  const cookies = Object.freeze(chunks.toSorted((a, b) => a.name.localeCompare(b.name)));
  assert.deepEqual(await getInvalidSessionCookies(cookies, secret), []);
  assert.deepEqual(await getInvalidSessionCookies(cookies, previousSecret), cookies.map(({ name }) => name));
});

test('пропуски, дубликаты, смешанные и неканонические chunks очищают всю группу', async () => {
  const value = await tokenFor(plain);
  for (const chunks of [
    [{ name: `${plain}.1`, value }],
    [{ name: `${plain}.0`, value }, { name: `${plain}.2`, value: 'extra' }],
    [{ name: `${plain}.0`, value }, { name: `${plain}.0`, value }],
    [{ name: plain, value }, { name: `${plain}.0`, value }],
    [{ name: `${plain}.0`, value }, { name: `${plain}.1`, value: '' }],
    [{ name: `${plain}.01`, value }],
    [{ name: `${plain}.foo`, value }],
    [{ name: plain, value }, { name: `${plain}-invalid-suffix`, value }],
  ]) {
    const names = [...new Set(chunks.map(({ name }) => name))];
    const cookies = [...chunks, { name: 'authjs.csrf-token', value: 'csrf-fixture' }];
    assert.deepEqual(await getInvalidSessionCookies(cookies, secret), names);
  }
});

test('ротация секрета сохраняет токены любого настроенного ключа', async () => {
  const keys = [secret, previousSecret];
  for (const base of SESSION_COOKIE_BASES) {
    for (const key of keys) {
      const cookies = [{ name: base, value: await tokenFor(base, key) }];
      assert.deepEqual(await getInvalidSessionCookies(cookies, keys), []);
    }
  }
});

test('отсутствующий секрет остаётся ошибкой конфигурации и не маскируется очисткой', async () => {
  const cookies = [{ name: plain, value: await tokenFor(plain) }];
  for (const missing of [undefined, null, '', [], [''], [secret, ''], 123]) {
    await assert.rejects(getInvalidSessionCookies(cookies, missing), {
      name: 'TypeError',
      message: 'A non-empty session secret is required.',
    });
  }
});

test('неожиданные ошибки декодера пробрасываются вместо скрытого выхода', async () => {
  const cookies = [{ name: plain, value: await tokenFor(plain) }];
  for (const error of [
    new TypeError('Unexpected decoder failure'),
    new Error('Unexpected decoder failure'),
    Object.assign(new Error('Infrastructure unavailable'), { code: 'ECONNREFUSED' }),
  ]) {
    await assert.rejects(
      getInvalidSessionCookies(cookies, secret, () => { throw error; }),
      (caught) => caught === error,
    );
  }
  assert.deepEqual(await getInvalidSessionCookies(cookies, secret, async () => null), [plain]);
});
