import test from 'node:test';
import assert from 'node:assert/strict';
import { clearLocalState, localStateKey, localValueUnchanged, readLocalState, writeLocalState } from '../lib/local-workspace.js';

const valid = (value) => typeof value?.text === 'string' && value.text.length <= 100;
const empty = { text: '' };
function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('локальные данные сохраняются после повторного чтения и разделены по аккаунту и форме', () => {
  const storage = memoryStorage();
  const key = localStateKey('user-one', 'draft:new-ticket');
  assert.equal(writeLocalState(storage, key, { text: 'Не отправленный текст' }, valid).ok, true);
  assert.deepEqual(readLocalState(storage, key, empty, valid).value, { text: 'Не отправленный текст' });
  assert.deepEqual(readLocalState(storage, localStateKey('user-two', 'draft:new-ticket'), empty, valid).value, empty);
  assert.deepEqual(readLocalState(storage, localStateKey('user-one', 'draft:comment:42'), empty, valid).value, empty);
  assert.notEqual(localStateKey('a.b', 'c'), localStateKey('a', 'b.c'));
});

test('повреждённое хранилище и неизвестная версия не ломают страницу и не перезаписываются при чтении', () => {
  const storage = memoryStorage();
  const key = localStateKey('user', 'preferences');
  for (const raw of ['{', '{"version":999,"data":{"text":"private"}}', '{"version":1,"data":{"text":false},"updatedAt":"2026-11-12T00:00:00Z"}']) {
    storage.setItem(key, raw);
    const result = readLocalState(storage, key, empty, valid);
    assert.equal(result.storageError, 'invalid');
    assert.deepEqual(result.value, empty);
    assert.equal(storage.getItem(key), raw);
  }
});

test('ошибки доступа и заполненное хранилище возвращают явную ошибку без исключения', () => {
  const unavailable = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const key = localStateKey('user', 'favorites');
  assert.equal(readLocalState(unavailable, key, empty, valid).storageError, 'unavailable');
  assert.equal(writeLocalState(unavailable, key, empty, valid).ok, false);
  assert.equal(clearLocalState(unavailable, key).ok, false);
  const full = { setItem() { throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); } };
  assert.equal(writeLocalState(full, key, empty, valid).storageError, 'quota');
});

test('очистка затрагивает только выбранный локальный ключ, неверные данные не записываются', () => {
  const storage = memoryStorage();
  const first = localStateKey('user', 'one');
  const second = localStateKey('user', 'two');
  writeLocalState(storage, first, { text: 'first' }, valid);
  writeLocalState(storage, second, { text: 'second' }, valid);
  assert.equal(writeLocalState(storage, second, { text: false }, valid).ok, false);
  assert.equal(clearLocalState(storage, first).ok, true);
  assert.deepEqual(readLocalState(storage, second, empty, valid).value, { text: 'second' });
  assert.deepEqual(readLocalState(storage, first, empty, valid).value, empty);
});

test('успешная отправка не очищает более новый черновик другой вкладки', () => {
  const submitted = { text: 'Отправленная версия' };
  const newer = { text: 'Новая неотправленная версия' };
  const saved = (value, updatedAt = 'new') => ({ value, updatedAt, storageError: null });
  assert.equal(localValueUnchanged(submitted, { ...submitted }, saved(submitted)), true);
  assert.equal(localValueUnchanged(submitted, newer, saved(newer)), false);
  assert.equal(localValueUnchanged(submitted, submitted, saved(newer)), false);
  assert.equal(localValueUnchanged(submitted, submitted, saved(empty, 'old'), { fallbackRevision: 'old', fallbackValue: empty }), true);
  assert.equal(localValueUnchanged(submitted, submitted, saved(newer, 'new'), { fallbackRevision: 'old', fallbackValue: empty }), false);
  assert.equal(localValueUnchanged(submitted, submitted, saved(newer, 'old'), { fallbackRevision: 'old', fallbackValue: empty }), false);
});
